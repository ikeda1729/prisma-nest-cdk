import * as cdk from 'aws-cdk-lib';
import { Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class Network extends Construct {

    readonly vpc: Vpc;
    readonly sgDataBase: SecurityGroup;
    readonly sgAppRunner: SecurityGroup;

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

        // 以下EC2の設定 ******************************************************

        // Create a key pair to be used with this EC2 Instance
        const key = new ec2.CfnKeyPair(this, "CfnKeyPair", {
            keyName: 'ec2-key-pair',
        });
        // Delete the key pair when the stack is deleted
        key.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        // Output the command to get the private key
        new cdk.CfnOutput(this, 'GetSSHKeyCommand', {
            value: `aws ssm get-parameter --name /ec2/keypair/${key.getAtt('KeyPairId')} --region ${process.env.CDK_DEFAULT_REGION} --with-decryption --query Parameter.Value --output text`,
        })

        // Security group for the EC2 instance
        const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
            vpc: this.vpc,
            description: "Allow SSH (TCP port 22) and HTTP (TCP port 80) in",
            allowAllOutbound: true,
        });

        // Allow SSH access on port tcp/22
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "Allow SSH Access");
        // Allow HTTP access on port tcp/80
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP Access");

        // IAM role to allow access to other AWS services
        const role = new iam.Role(this, "ec2Role", { assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"), });
        // IAM policy attachment to allow access to 
        role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

        // EC2のMathine Image
        const ami = new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            cpuType: ec2.AmazonLinuxCpuType.X86_64,
        });
        // Aurora接続用のEC2
        const ec2DataBase = new ec2.Instance(this, "BationEC2", {
            vpc: this.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.T2,
                ec2.InstanceSize.MICRO
            ),
            machineImage: ami,
            securityGroup: securityGroup,
            keyName: key.keyName,
            role: role,
        });

        // Elasitc IP for the EC2 instance
        const eip = new ec2.CfnEIP(this, "EIP")
        // Attach the Elastic IP to the EC2 instance
        new ec2.CfnEIPAssociation(this, "EIPAssociation", {
            allocationId: eip.attrAllocationId,
            instanceId: ec2DataBase.instanceId,
        });

    }
}
