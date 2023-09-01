# App Runner CDK sample
Keyword: Nest.js, Prisma, App Runner, RDS, Aurora Postgres, VPC connector.

The repo of this article (in Japanese )
https://zenn.dev/yusuke_ikeda/articles/34bd37ac51cfc9

Deploy a Nest.js + Prisma app with CDK, using App Runner.

To deploy.
```
cd infra
cdk deploy
```

To migrate db, login to the created ec2 instance.
```
aws ssm start-session --target {ec2-id}
```

In app dir, create .env with `DATABASE_URL` and run.
```
npx prisma db push
./node_modules/.bin/ts-node  prisma/seed.ts
```
