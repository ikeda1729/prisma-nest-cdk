import { Service, Source, VpcConnector } from '@aws-cdk/aws-apprunner-alpha';
import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { CfnObservabilityConfiguration, CfnService } from 'aws-cdk-lib/aws-apprunner';
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Effect, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { DockerImageName, ECRDeployment } from 'cdk-ecr-deployment';
import { Construct } from 'constructs';
import * as path from "path";

type AppStackProps = {
    vpc: Vpc,
    sgAppRunner: SecurityGroup,
    dbSecret: Secret,
}

export class AppRunnerService extends Construct {
    constructor(scope: Construct, id: string, props: AppStackProps) {
        super(scope, id);

        // VPC Connector
        const vpcConnector = new VpcConnector(this, 'VpcConnector', {
            vpc: props.vpc,
            vpcSubnets: props.vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
            vpcConnectorName: 'sampleapp-vpc-connector',
            securityGroups: [props.sgAppRunner],
        });

        // ECRリポジトリ
        const repo = new Repository(this, 'AppRunnerRepository', {
            repositoryName: 'sampleapp',
            removalPolicy: RemovalPolicy.DESTROY,
        });

        // コンテナイメージをECRリポジトリにデプロイ
        const image = new DockerImageAsset(this, 'AppRunnerDockerImage', {
            directory: path.join(__dirname, '../../app/'),
            platform: Platform.LINUX_AMD64,
            target: 'production-build-stage',
        });
        new ECRDeployment(this, 'DeployDockerImage', {
            src: new DockerImageName(image.imageUri),
            dest: new DockerImageName(repo.repositoryUri),
        });

        // App Runner Service インスタンスロール
        const instanceRole = new Role(this, 'AppRunnerInstanceRole', {
            roleName: 'SampleAppRunnerInstanceRole',
            assumedBy: new ServicePrincipal('tasks.apprunner.amazonaws.com'),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
            ],
            inlinePolicies: {
                "AllowGetSecretValue": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: [
                                "secretsmanager:GetResourcePolicy",
                                "secretsmanager:GetSecretValue",
                                "secretsmanager:DescribeSecret",
                                "secretsmanager:ListSecretVersionIds"
                            ],
                            resources: [
                                `arn:aws:secretsmanager:${(scope as Stack).region}:${(scope as Stack).account}:secret:${props.dbSecret.secretName}-*`
                            ]
                        })
                    ]
                })
            }
        });
        // App Runner Service
        const service = new Service(this, 'AppRunnerService', {
            source: Source.fromEcr({
                repository: repo,
                imageConfiguration: {
                    port: 3000,
                    environment: {
                        "DB_SECRET_NAME": props.dbSecret.secretName,
                    }
                }
            }),
            serviceName: 'sampleApp',
            vpcConnector: vpcConnector,
            instanceRole: instanceRole,
        });
        service.applyRemovalPolicy(RemovalPolicy.DESTROY);

        // トレースの有効化
        const cfnObservabilityConfig = new CfnObservabilityConfiguration(this, 'SampleAppRunnerObservConfig', {
            observabilityConfigurationName: 'SampleAppRunnerObservConfig',
            traceConfiguration: {
                vendor: 'AWSXRAY'
            }
        });
        const cfnService = service.node.defaultChild as CfnService;
        cfnService.addPropertyOverride('ObservabilityConfiguration', {
            'ObservabilityEnabled': true,
            'ObservabilityConfigurationArn': cfnObservabilityConfig.ref
        })

        // AppRunnerサービスURL
        new CfnOutput(this, 'ServiceURL', {
            exportName: 'AppRunnerServiceUrl',
            value: service.serviceUrl
        });
        // AppRunnerサービスARN
        new CfnOutput(this, 'ServiceARN', {
            exportName: 'AppRunnerServiceArn',
            value: service.serviceArn
        });
    }
}
