import * as cdk from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { AuroraPostgresEngineVersion, CfnDBCluster, CfnDBInstance, Credentials, DatabaseCluster, DatabaseClusterEngine, DatabaseInstance, ServerlessCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct, IConstruct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

interface AuroraProps {
    vpc: Vpc,
    sgDatabase: SecurityGroup,
    ec2DB: ec2.Instance,
}

export class Aurora extends Construct {
    readonly secret: Secret;

    constructor(scope: Construct, id: string, props: AuroraProps) {
        super(scope, id);

        // Aurora用クレデンシャル
        this.secret = new Secret(this, 'DBSecret', {
            secretName: 'AuroraClusterSecret',
            generateSecretString: {
                excludePunctuation: true,
                includeSpace: false,
                generateStringKey: 'password',
                secretStringTemplate: JSON.stringify({
                    username: 'appuser',
                })
            }
        })

        // Aurora Serverless V2クラスター
        const instanceIdPrefix = 'Instance'; // 後でインスタンスクラスを書き換えるため、インスタンスIDのプレフィクスを指定
        const cluster = new DatabaseCluster(this, 'AuroraCluster', {
            engine: DatabaseClusterEngine.auroraPostgres({
                version: AuroraPostgresEngineVersion.VER_14_3
            }),
            credentials: Credentials.fromSecret(this.secret),
            defaultDatabaseName: 'sampledb',
            instanceIdentifierBase: instanceIdPrefix,
            instanceProps: {
                vpc: props.vpc,
                vpcSubnets: props.vpc.selectSubnets({ subnetGroupName: 'db' }),
                securityGroups: [props.sgDatabase],
                instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MEDIUM), // 後でインスタンスクラスを書き換えるため、ダミーを設定
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // ec2からの接続を許可
        cluster.connections.allowFrom(props.ec2DB, ec2.Port.tcp(5432));

        const clusterSecret = cluster.secret!
        const dbname = clusterSecret.secretValueFromJson('dbname').unsafeUnwrap();
        const host = clusterSecret.secretValueFromJson('host').unsafeUnwrap();
        const username = clusterSecret.secretValueFromJson('username').unsafeUnwrap();
        const password = clusterSecret.secretValueFromJson('password').unsafeUnwrap();
        const port = clusterSecret.secretValueFromJson('port').unsafeUnwrap();
        const databaseUrl = `postgresql://${username}:${password}@${host}:${port}/${dbname}`;
        // databaseUrl をシークレットとして登録
        this.secret = new Secret(this, 'DatabaseUrlSecret', {
            secretStringValue: cdk.SecretValue.unsafePlainText(databaseUrl),
        });

        // 現時点ではL2クラスがServerless V2未対応のため、L1クラスから書き換え
        const cfnCluster = cluster.node.defaultChild as CfnDBCluster;
        cfnCluster.addPropertyOverride('ServerlessV2ScalingConfiguration', {
            'MaxCapacity': 5,
            'MinCapacity': 0.5,
        });
        cfnCluster.addPropertyDeletionOverride('EngineMode');

        // 指定したインスタンスIDプレフィクスを持つノードを抽出してインスタンスインスタンスクラスを書き換える
        const children = cluster.node.children;
        for (const child of children) {
            if (child.node.id.startsWith(instanceIdPrefix)) {
                (child as CfnDBInstance).dbInstanceClass = 'db.serverless';
            }
        }
    }
}
