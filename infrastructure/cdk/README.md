# Voice Agent HIPAA-Compliant Infrastructure

This directory contains the AWS CDK infrastructure for the Capitol Eye Care Voice Agent system, designed to meet HIPAA compliance requirements and provide secure, scalable healthcare infrastructure.

## 🏗️ Architecture Overview

The infrastructure is organized into four main stacks:

1. **Security Stack** - KMS keys, IAM roles, and encryption management
2. **VPC Stack** - Network infrastructure with security groups and VPC endpoints
3. **Database Stack** - PostgreSQL RDS cluster and Redis ElastiCache with encryption
4. **Monitoring Stack** - CloudWatch dashboards, alarms, CloudTrail, and AWS Config

## 🔒 HIPAA Compliance Features

### Encryption
- ✅ **Data at Rest**: All databases encrypted with customer-managed KMS keys
- ✅ **Data in Transit**: TLS 1.2+ enforced for all communications
- ✅ **Key Rotation**: Automatic 90-day KMS key rotation enabled

### Audit & Monitoring
- ✅ **CloudTrail**: Immutable audit logs with file integrity validation
- ✅ **VPC Flow Logs**: Network traffic monitoring
- ✅ **CloudWatch**: Real-time monitoring with custom dashboards
- ✅ **AWS Config**: Compliance rule monitoring

### Access Control
- ✅ **IAM Roles**: Least privilege access with service-specific permissions
- ✅ **Security Groups**: Network-level access control
- ✅ **Network ACLs**: Additional network security layer
- ✅ **Private Subnets**: Database isolation from internet

### Backup & Recovery
- ✅ **Automated Backups**: RDS automated backups with 30-day retention
- ✅ **AWS Backup**: Cross-service backup with 7-year retention (HIPAA requirement)
- ✅ **Multi-AZ**: High availability with automatic failover

## 📁 Stack Structure

```
infrastructure/cdk/
├── bin/
│   └── voice-agent-infra.ts    # CDK app entry point
├── lib/
│   ├── vpc-stack.ts             # VPC, subnets, security groups
│   ├── security-stack.ts        # KMS keys, IAM roles
│   ├── database-stack.ts        # RDS PostgreSQL, Redis ElastiCache
│   └── monitoring-stack.ts      # CloudWatch, CloudTrail, Config
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── cdk.json                    # CDK configuration
└── README.md                   # This file
```

## 🚀 Deployment Guide

### Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Node.js** version 18+ installed
3. **AWS CDK CLI** installed globally: `npm install -g aws-cdk`
4. **IAM Permissions** for creating infrastructure resources

### Environment Setup

```bash
# Navigate to CDK directory
cd infrastructure/cdk

# Install dependencies
npm install

# Bootstrap CDK (first time only)
npm run bootstrap
```

### Development Deployment

```bash
# Synthesize CloudFormation templates
npm run synth

# View differences before deployment
npm run diff

# Deploy to development environment
npm run deploy:dev
```

### Staging/Production Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

### Resource Cleanup

```bash
# Destroy all stacks (USE WITH CAUTION)
npm run destroy
```

## 🔧 Configuration

### Environment Variables

Set these environment variables before deployment:

```bash
export CDK_DEFAULT_ACCOUNT="123456789012"  # Your AWS account ID
export CDK_DEFAULT_REGION="us-west-2"     # Primary AWS region
```

### Environment Contexts

The infrastructure supports multiple environments via CDK contexts:

- `dev` - Development environment with minimal resources
- `staging` - Staging environment for testing
- `prod` - Production environment with full HIPAA compliance

### Resource Naming

All resources are prefixed with the pattern: `VoiceAgent-{environment}-{service}`

Examples:
- `VoiceAgent-dev-VPC`
- `VoiceAgent-prod-Database`
- `VoiceAgent-staging-Security`

## 📊 Monitoring & Alerting

### CloudWatch Dashboard

Access the HIPAA compliance dashboard at:
```
https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#dashboards:name=VoiceAgent-HIPAA-Compliance
```

### Key Metrics Monitored

1. **Database Performance**
   - CPU utilization (alert threshold: 80%)
   - Connection count (alert threshold: 80 connections)
   - Storage usage and IOPS

2. **Redis Performance**
   - Memory utilization (alert threshold: 80%)
   - CPU utilization
   - Connection count

3. **Security Metrics**
   - Failed login attempts (alert threshold: 10 attempts)
   - API 4XX errors
   - Unauthorized access attempts

### Alerts

All critical alerts are sent to the SNS topic: `voice-agent-alerts`

## 🔐 Security Configuration

### KMS Keys

Four separate customer-managed KMS keys are created:

1. **RDS Key** (`alias/voice-agent-rds`) - Database encryption
2. **Redis Key** (`alias/voice-agent-redis`) - Cache encryption
3. **Secrets Key** (`alias/voice-agent-secrets`) - Secrets Manager encryption
4. **Audit Key** (`alias/voice-agent-audit-logs`) - Log encryption

### IAM Roles

- **Lambda Execution Role** - Minimal permissions for microservice functions
- **RDS Monitoring Role** - Enhanced monitoring for database performance

### Network Security

- **Private Subnets** - All databases isolated from internet
- **Security Groups** - Port-specific access control
- **VPC Endpoints** - AWS service access without internet routing
- **Bastion Host** - Secure database access for troubleshooting

## 🗄️ Database Configuration

### PostgreSQL RDS Cluster

- **Engine**: Aurora PostgreSQL 15.4
- **Instance Type**: t4g.medium (2 instances, Multi-AZ)
- **Storage**: Encrypted with customer-managed KMS key
- **Backups**: 30-day retention with point-in-time recovery
- **Monitoring**: Performance Insights enabled with 731-day retention

### Redis ElastiCache

- **Engine**: Redis 7.2
- **Node Type**: cache.r7g.large (2 nodes, Multi-AZ)
- **Encryption**: At-rest and in-transit with customer-managed KMS key
- **Auth**: Redis AUTH token stored in Secrets Manager
- **Backups**: 7-day snapshot retention

## 📋 Compliance Validation

### AWS Config Rules

The following managed rules are automatically deployed:

- `RDS_STORAGE_ENCRYPTED` - Validates RDS encryption
- `RDS_INSTANCE_PUBLIC_READ_PROHIBITED` - Ensures databases are private
- `RDS_DB_INSTANCE_BACKUP_ENABLED` - Validates backup configuration
- `RDS_INSTANCE_DEFAULT_PORT_CHECK` - Checks for default port usage

### Audit Logs

- **CloudTrail** - All API calls logged with integrity validation
- **VPC Flow Logs** - Network traffic monitoring
- **Application Logs** - Centralized logging with 1-year retention
- **Database Logs** - PostgreSQL query logging enabled

## 🚨 Troubleshooting

### Common Issues

1. **CDK Bootstrap Failed**
   ```bash
   # Ensure you have proper IAM permissions
   aws sts get-caller-identity

   # Bootstrap with explicit parameters
   cdk bootstrap aws://ACCOUNT-NUMBER/REGION
   ```

2. **Stack Deployment Failed**
   ```bash
   # Check CloudFormation events
   aws cloudformation describe-stack-events --stack-name VoiceAgent-dev-VPC

   # Validate template syntax
   npm run synth
   ```

3. **Database Connection Issues**
   ```bash
   # Connect via bastion host
   aws ec2-instance-connect send-ssh-public-key \
     --instance-id i-1234567890abcdef0 \
     --instance-os-user ec2-user \
     --ssh-public-key file://~/.ssh/id_rsa.pub
   ```

### Log Analysis

Use CloudWatch Insights for security analysis:

```sql
fields @timestamp, @message
| filter @message like /ERROR/ or @message like /FAIL/ or @message like /UNAUTHORIZED/
| stats count() by bin(5m)
| sort @timestamp desc
```

## 📞 Support

For infrastructure support and HIPAA compliance questions:

- **Internal Team**: Capitol Eye Care Development Team
- **AWS Support**: Contact AWS Support for service-related issues
- **Documentation**: Refer to AWS HIPAA whitepaper and compliance guides

## 🔄 Maintenance

### Regular Tasks

1. **Weekly**: Review CloudWatch alarms and dashboard metrics
2. **Monthly**: Validate AWS Config compliance rules
3. **Quarterly**: Review and rotate non-KMS credentials
4. **Annually**: Conduct HIPAA compliance audit

### Updates

- **CDK Version**: Keep CDK updated to latest stable version
- **OS Patches**: RDS instances automatically updated during maintenance windows
- **Security**: Monitor AWS security bulletins and apply patches promptly

---

**Last Updated**: September 2025
**CDK Version**: 2.114.0
**Compliance**: HIPAA, SOC 2 Type II ready