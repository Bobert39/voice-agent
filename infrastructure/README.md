# HIPAA-Compliant Infrastructure for Capitol Eye Care Voice Agent

## Overview

This directory contains Infrastructure as Code (IaC) for deploying a HIPAA-compliant cloud infrastructure on AWS for the Capitol Eye Care Voice Agent system. The infrastructure is designed to securely handle Protected Health Information (PHI) while providing high availability, scalability, and comprehensive monitoring.

## 🏗️ Architecture Overview

The infrastructure consists of:
- **Multi-AZ VPC** with public, private, and database subnets
- **Encrypted PostgreSQL RDS** with Multi-AZ deployment
- **Redis ElastiCache** with encryption and clustering
- **KMS encryption** for all data at rest
- **VPC Flow Logs** and CloudTrail for audit logging
- **CloudWatch monitoring** with custom dashboards and alarms
- **AWS Backup** with 7-year retention for HIPAA compliance
- **Security Groups** with least-privilege access

## 🔒 HIPAA Compliance Features

✅ **Encryption at Rest**: All data encrypted with customer-managed KMS keys  
✅ **Encryption in Transit**: TLS 1.2+ for all communications  
✅ **Audit Logging**: Comprehensive logging with CloudTrail and VPC Flow Logs  
✅ **Access Controls**: IAM roles with least privilege principle  
✅ **Network Isolation**: Private subnets with no direct internet access  
✅ **Backup & Recovery**: Automated backups with 7-year retention  
✅ **Monitoring**: Real-time monitoring with CloudWatch alarms  
✅ **Security Scanning**: AWS Config rules for compliance validation  

## 📁 Directory Structure

```
infrastructure/
├── terraform/
│   ├── main.tf              # Main infrastructure configuration
│   ├── database.tf          # Database and cache resources
│   ├── monitoring.tf        # CloudWatch and compliance monitoring
│   ├── variables.tf         # Input variables
│   ├── outputs.tf          # Output values
│   └── terraform.tfvars.example  # Example configuration
├── aws-hipaa-architecture.md     # Detailed architecture documentation
├── deploy.sh               # Deployment automation script
└── README.md              # This file
```

## 🚀 Quick Start

### Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.0 installed
3. **HIPAA-eligible AWS region** (us-east-1, us-west-2, us-gov-east-1, us-gov-west-1)
4. **AWS Business Associate Agreement (BAA)** signed with AWS

### Step 1: Configure Variables

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your specific configuration
```

### Step 2: Deploy Infrastructure

```bash
# Deploy development environment
../deploy.sh -e development

# Deploy staging environment
../deploy.sh -e staging

# Deploy production environment (requires manual confirmation)
../deploy.sh -e production
```

### Step 3: Verify Deployment

```bash
# Check infrastructure status
terraform output

# Run security scan
tfsec .

# Run cost estimation
infracost breakdown --path .
```

## 🛠️ Manual Deployment

If you prefer manual deployment:

```bash
cd terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -var="environment=development" -out=terraform.tfplan

# Apply deployment
terraform apply terraform.tfplan

# View outputs
terraform output
```

## 🔧 Configuration

### Environment-Specific Settings

The infrastructure supports three environments with different configurations:

#### Development
- Single AZ deployment
- Smaller instance types (cost-optimized)
- Shorter backup retention
- No deletion protection

#### Staging
- Multi-AZ deployment
- Production-like sizing
- Standard backup retention
- Limited deletion protection

#### Production
- Full Multi-AZ deployment
- High-performance instances
- 7-year backup retention (HIPAA compliance)
- Full deletion protection
- Enhanced monitoring and alerting

### Key Variables

| Variable | Description | Default | Production Recommended |
|----------|-------------|---------|----------------------|
| `environment` | Environment name | development | production |
| `db_instance_class` | RDS instance type | db.t3.medium | db.r5.large |
| `redis_node_type` | Redis instance type | cache.t3.micro | cache.r5.large |
| `backup_retention_days` | Backup retention | 35 | 2555 (7 years) |
| `enable_deletion_protection` | Prevent accidental deletion | false | true |
| `alert_email` | CloudWatch alerts email | "" | admin@capitoleyecare.com |

## 📊 Monitoring and Alerting

### CloudWatch Dashboard

The infrastructure includes a comprehensive CloudWatch dashboard monitoring:
- RDS PostgreSQL metrics (CPU, connections, memory, storage)
- Redis cache metrics (CPU, memory usage, connections)
- VPC security analysis (rejected connections)
- Database slow query analysis

### Automated Alarms

Configured alarms for:
- **RDS High CPU** (>80% for 10 minutes)
- **RDS High Connections** (>50 connections)
- **RDS Low Storage** (<10GB free space)
- **Redis High CPU** (>80% for 10 minutes)
- **Redis High Memory** (>90% usage)

### Security Monitoring

- **VPC Flow Logs**: All network traffic logged
- **CloudTrail**: All API calls audited
- **AWS Config**: Compliance rules monitoring
- **Log Insights**: Predefined queries for security analysis

## 💾 Backup and Recovery

### Automated Backups

- **RDS Automated Backups**: 35 days retention (2555 days for production)
- **Point-in-time Recovery**: Enabled for RDS
- **AWS Backup**: Cross-service backup automation
- **Cross-region Backup**: Available for disaster recovery

### Recovery Procedures

1. **RDS Point-in-time Recovery**:
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier voice-agent-prod-database \
     --target-db-instance-identifier voice-agent-restored \
     --restore-time 2025-01-01T12:00:00Z
   ```

2. **Infrastructure Recreation**:
   ```bash
   # Infrastructure is version-controlled and can be recreated
   terraform apply
   ```

## 🔐 Security Best Practices

### Network Security
- Private subnets for all application and database resources
- Security groups with minimal required access
- NACLs for additional network-level protection
- NAT gateways for secure outbound internet access

### Data Security
- Customer-managed KMS keys with automatic rotation
- Encryption at rest for all storage services
- TLS 1.2+ required for all communications
- Secrets stored in AWS Secrets Manager

### Access Security
- IAM roles with least privilege principle
- Multi-factor authentication required for production
- Service accounts with automatic credential rotation
- Regular access reviews and permission audits

### Audit and Compliance
- CloudTrail logging all API activities
- VPC Flow Logs for network monitoring
- AWS Config for compliance validation
- Centralized logging in CloudWatch

## 💰 Cost Optimization

### Development Environment
Estimated monthly cost: **$200-300**
- db.t3.small RDS instance
- cache.t3.micro Redis
- Single NAT gateway
- Basic monitoring

### Production Environment
Estimated monthly cost: **$800-1200**
- db.r5.large Multi-AZ RDS
- cache.r5.large Redis cluster
- Dual NAT gateways
- Enhanced monitoring
- 7-year backup retention

### Cost Optimization Tips
1. Use Reserved Instances for predictable workloads
2. Enable RDS auto-scaling for variable loads
3. Use Spot Instances for development environments
4. Regular resource rightsizing reviews
5. CloudWatch cost monitoring and budgets

## 🚨 Troubleshooting

### Common Issues

1. **Terraform State Lock**:
   ```bash
   terraform force-unlock <lock-id>
   ```

2. **RDS Connection Issues**:
   - Check security group rules
   - Verify subnet group configuration
   - Confirm VPC DNS settings

3. **Redis Connection Issues**:
   - Verify AUTH token in Secrets Manager
   - Check security group rules
   - Confirm encryption settings

4. **KMS Access Denied**:
   - Review KMS key policies
   - Check IAM role permissions
   - Verify key alias configuration

### Debugging Commands

```bash
# Check AWS credentials
aws sts get-caller-identity

# Validate Terraform configuration
terraform validate

# Check resource dependencies
terraform graph | dot -Tpng > graph.png

# View detailed logs
terraform apply -log=TRACE

# Test database connectivity
psql -h <endpoint> -U <username> -d <database>

# Test Redis connectivity
redis-cli -h <endpoint> -p 6379 -a <auth-token>
```

## 📚 Additional Resources

### Documentation
- [AWS HIPAA Compliance](https://aws.amazon.com/compliance/hipaa-compliance/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

### Security Guides
- [AWS Security Best Practices](https://aws.amazon.com/architecture/security-identity-compliance/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)

### Monitoring Resources
- [CloudWatch Best Practices](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/best-practices.html)
- [RDS Monitoring](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/monitoring-overview.html)
- [ElastiCache Monitoring](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/monitoring-overview.html)

## 🤝 Support

For infrastructure support:
1. Check the troubleshooting section above
2. Review CloudWatch logs and alarms
3. Consult AWS documentation
4. Contact the DevOps team at devops@capitoleyecare.com

## 📄 License

This infrastructure code is proprietary to Capitol Eye Care and subject to internal security and compliance requirements.