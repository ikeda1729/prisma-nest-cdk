import * as cdk from 'aws-cdk-lib';
import { Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class Network extends Construct {

    readonly vpc: Vpc;
    readonly sgDataBase: SecurityGroup;
    readonly sgAppRunner: SecurityGroup;
    readonly ec2DB: ec2.Instance;

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

        // RDS接続用EC2
        // Create a key pair to be used with this EC2 Instance
        const key = new ec2.CfnKeyPair(this, "CfnKeyPair", {
            keyName: 'ec2-key-pair',
        });
        // Delete the key pair when the stack is deleted
        key.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        // Output the command to get the private key
        const region = cdk.Stack.of(this).region;
        new cdk.CfnOutput(this, 'GetSSHKeyCommand', {
            value: `aws ssm get-parameter --name /ec2/keypair/${key.getAtt('KeyPairId')} --region ${region}} --with-decryption --query Parameter.Value --output text`,
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

        // Look up the AMI Id for the Amazon Linux 2 Image with CPU Type X86_64
        const ami = new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            cpuType: ec2.AmazonLinuxCpuType.X86_64,
        });

        //////////////////////////////////////////////////////////////////
        // EC2 to RDS Connection
        //////////////////////////////////////////////////////////////////

        // set instance profile to use ssm
        const instanceProfile = new iam.Role(this, "ec2_profile", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            description: "for instance profile",
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
            ],
        });

        // create EC2 instance
        this.ec2DB = new ec2.Instance(this, "Web-EC2", {
            vpc: this.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.T2,
                ec2.InstanceSize.MICRO
            ),
            machineImage: ami,
            keyName: key.keyName,
            role: instanceProfile,
        });
    }
}
