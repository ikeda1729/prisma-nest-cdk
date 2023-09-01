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
    }
}
