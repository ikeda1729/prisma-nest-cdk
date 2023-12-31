import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { Aurora } from './aurora'
import { Network } from './network'
import { AppRunnerService } from './apprunner'

export class InfraStack extends cdk.Stack {
  readonly network: Network
  readonly aurora: Aurora
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Network
    this.network = new Network(this, 'Network')

    // Aurora
    this.aurora = new Aurora(this, 'AuroraCluster', {
      vpc: this.network.vpc,
      sgDatabase: this.network.sgDataBase,
      ec2DB: this.network.ec2DB,
    })

    // App Runner Service
    const app = new AppRunnerService(this, 'AppStack', {
      vpc: this.network.vpc,
      sgAppRunner: this.network.sgAppRunner,
      secretDbUrl: this.aurora.secretDbUrl,
    })

    app.node.addDependency(this.aurora)
  }
}
