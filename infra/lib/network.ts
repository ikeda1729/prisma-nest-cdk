import * as cdk from 'aws-cdk-lib';
import { Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class Network extends Construct {

    readonly vpc: Vpc;
    readonly sgDataBase: SecurityGroup;
    readonly sgAppRunner: SecurityGroup;
    readonly rdsSG: SecurityGroup;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id);

        // VPC
        this.vpc = new Vpc(this, 'Vpc', {
            vpcName: 'sampleapp-vpc',
            cidr: '10.0.0.0/16',
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'public',
                    subnetType: SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'app',
                    subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    cidrMask: 24,
                    name: 'db',
                    subnetType: SubnetType.PRIVATE_ISOLATED,
                }
            ],
            natGateways: 1,
            enableDnsHostnames: true,
            enableDnsSupport: true,
        });

        // AppRunner用セキュリティグループ
        this.sgAppRunner = new SecurityGroup(this, 'ApprunnerSecurityGroup', {
            securityGroupName: 'apprunner-sg',
            vpc: this.vpc,
            allowAllOutbound: true
        });

        // Aurora用セキュリティグループ
        this.sgDataBase = new SecurityGroup(this, 'DatabaseSecurityGroup', {
            securityGroupName: 'database-sg',
            vpc: this.vpc,
            allowAllOutbound: true
        });

        // AppRunnerからAuroraへの接続許可
        this.sgDataBase.addIngressRule(
            this.sgAppRunner,
            Port.tcp(5432)
        );

        // RDS接続用のEC2 *** ここから追加 ***


        // EC2 SecurityGroup
        const region = cdk.Stack.of(this).region;
        // 踏み台サーバの設定追加
        const endpoints: Array<[string, string]> =
            [[`com.amazonaws.${region}.ssm`, 'ssm'],
            [`com.amazonaws.${region}.ec2messages`, 'ec2messages'],
            [`com.amazonaws.${region}.ssmmessages`, 'ssmmessages']]

        for (const data of endpoints) {
            new ec2.InterfaceVpcEndpoint(this, data[1], {
                vpc: this.vpc,
                service: new ec2.InterfaceVpcEndpointService(data[0], 443),
                privateDnsEnabled: true // プライベートDNS有効化しておく
            });
        }
        const subnetSelection: ec2.SubnetSelection = {
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED, onePerAz: true
        };
        new ec2.GatewayVpcEndpoint(this, 's3gateway', {
            vpc: this.vpc,
            service: ec2.GatewayVpcEndpointAwsService.S3,
            subnets: [subnetSelection]
        });

        const ec2InstanceSG = new ec2.SecurityGroup(this, 'ec2-instance-sg', {
            vpc: this.vpc,
            allowAllOutbound: true // アウトバウンドはデフォルトがtrue
        });

        ec2InstanceSG.addIngressRule( // インバウンド
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(5432)
        );

        // RDS SecurityGroup
        this.rdsSG = new ec2.SecurityGroup(this, 'rds-sg', {
            vpc: this.vpc,
            allowAllOutbound: true
        });
        this.rdsSG.addIngressRule( // インバウンド
            ec2InstanceSG,
            ec2.Port.tcp(5432)
        );

        const host = new ec2.BastionHostLinux(this, 'BastionHost', {
            vpc: this.vpc,
            instanceName: "bastion",
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
            subnetSelection: {
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED, // プライベートサブネットにEC2配置
            },
            securityGroup: ec2InstanceSG,
        });
        // あらかじめインストールしておく
        host.instance.addUserData("yum -y update", "yum install -y postgresql jq")

    }
}
