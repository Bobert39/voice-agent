# AWS HIPAA-Compliant Infrastructure Architecture

## Overview

This document outlines the HIPAA-compliant cloud infrastructure architecture for the Capitol Eye Care Voice Agent system. The design prioritizes security, compliance, and scalability while maintaining cost-effectiveness.

## Architecture Principles

### HIPAA Compliance Requirements
1. **Business Associate Agreement (BAA)** with AWS
2. **Encryption at rest** for all data storage
3. **Encryption in transit** for all data transmission
4. **Access controls** and audit logging
5. **Network segmentation** and isolation
6. **Automated backup** and disaster recovery
7. **Security incident monitoring** and reporting

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AWS Region (us-east-1)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Production VPC                       │   │
│  │           (10.0.0.0/16)                            │   │
│  │  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │Public Subnet │  │Public Subnet │                │   │
│  │  │us-east-1a    │  │us-east-1b    │                │   │
│  │  │10.0.1.0/24   │  │10.0.2.0/24   │                │   │
│  │  │              │  │              │                │   │
│  │  │  ┌─────────┐ │  │  ┌─────────┐ │                │   │
│  │  │  │   ALB   │ │  │  │   ALB   │ │                │   │
│  │  │  └─────────┘ │  │  └─────────┘ │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  │                                                    │   │
│  │  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │Private Sub A │  │Private Sub B │                │   │
│  │  │us-east-1a    │  │us-east-1b    │                │   │
│  │  │10.0.10.0/24  │  │10.0.20.0/24  │                │   │
│  │  │              │  │              │                │   │
│  │  │ ┌──────────┐ │  │ ┌──────────┐ │                │   │
│  │  │ │   ECS    │ │  │ │   ECS    │ │                │   │
│  │  │ │ Services │ │  │ │ Services │ │                │   │
│  │  │ └──────────┘ │  │ └──────────┘ │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  │                                                    │   │
│  │  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │Database Sub A│  │Database Sub B│                │   │
│  │  │us-east-1a    │  │us-east-1b    │                │   │
│  │  │10.0.100.0/24 │  │10.0.200.0/24 │                │   │
│  │  │              │  │              │                │   │
│  │  │ ┌──────────┐ │  │ ┌──────────┐ │                │   │
│  │  │ │   RDS    │ │  │ │ElastiCache│ │                │   │
│  │  │ │PostgreSQL│ │  │ │  Redis   │ │                │   │
│  │  │ └──────────┘ │  │ └──────────┘ │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Virtual Private Cloud (VPC)
**Purpose**: Isolated network environment for all resources

**Configuration**:
- **CIDR Block**: 10.0.0.0/16
- **Availability Zones**: us-east-1a, us-east-1b (Multi-AZ for high availability)
- **DNS Hostnames**: Enabled
- **DNS Resolution**: Enabled

**Security Features**:
- VPC Flow Logs enabled for network monitoring
- Network ACLs for subnet-level security
- Security Groups for instance-level security
- No direct internet access to private subnets

### 2. Subnet Architecture

#### Public Subnets (DMZ)
- **Purpose**: Load balancers and bastion hosts only
- **Subnet A**: 10.0.1.0/24 (us-east-1a)
- **Subnet B**: 10.0.2.0/24 (us-east-1b)
- **Internet Gateway**: Attached for outbound internet access

#### Private Application Subnets
- **Purpose**: Application servers and microservices
- **Subnet A**: 10.0.10.0/24 (us-east-1a)
- **Subnet B**: 10.0.20.0/24 (us-east-1b)
- **NAT Gateway**: For outbound internet access (software updates)

#### Database Subnets
- **Purpose**: Database and cache services
- **Subnet A**: 10.0.100.0/24 (us-east-1a)
- **Subnet B**: 10.0.200.0/24 (us-east-1b)
- **No Internet Access**: Completely isolated

### 3. Database Layer

#### Primary Database - Amazon RDS PostgreSQL
**Configuration**:
- **Engine**: PostgreSQL 15.x
- **Instance Class**: db.t3.medium (production: db.r5.large)
- **Multi-AZ**: Enabled for high availability
- **Encryption**: KMS encryption at rest
- **Backup Retention**: 35 days (HIPAA compliance)
- **Point-in-time Recovery**: Enabled

**Security**:
- Database subnet group in private subnets
- Security group allowing access only from application tier
- SSL/TLS encryption in transit (required)
- Database activity streaming to CloudWatch

#### Session Management - Amazon ElastiCache Redis
**Configuration**:
- **Engine**: Redis 7.x
- **Node Type**: cache.t3.micro (production: cache.r5.large)
- **Replication Group**: Multi-AZ enabled
- **Encryption**: In-transit and at-rest encryption
- **Auth Token**: Redis AUTH enabled

**Security**:
- Cache subnet group in private subnets
- Security group restricting access to application tier
- Automatic failover enabled

### 4. Application Layer

#### Container Platform - Amazon ECS with Fargate
**Configuration**:
- **Launch Type**: Fargate (serverless containers)
- **Service Auto Scaling**: Based on CPU/memory utilization
- **Task CPU**: 512 (0.5 vCPU) minimum
- **Task Memory**: 1024 MB minimum

**Security**:
- Task execution role with minimal permissions
- Container images from private ECR repositories
- Secrets managed via AWS Secrets Manager
- Network isolation within private subnets

#### Load Balancing - Application Load Balancer (ALB)
**Configuration**:
- **Scheme**: Internet-facing
- **Protocol**: HTTPS only (HTTP redirects to HTTPS)
- **SSL Certificate**: AWS Certificate Manager (ACM)
- **Health Checks**: Enabled with custom health check endpoints

**Security Features**:
- WAF (Web Application Firewall) attached
- Security groups restricting access to HTTPS (443)
- Access logs to S3 bucket

### 5. Security and Monitoring

#### Key Management - AWS KMS
**Configuration**:
- **Customer Managed Keys**: Separate keys for different data types
- **Key Rotation**: Automatic annual rotation
- **Key Policies**: Least privilege access

**Keys**:
- Database encryption key
- S3 encryption key
- EBS encryption key
- Secrets Manager encryption key

#### Monitoring and Logging - CloudWatch and CloudTrail
**CloudWatch**:
- Custom dashboards for application metrics
- Alarms for critical thresholds
- Log aggregation from all services
- Centralized logging with log retention policies

**CloudTrail**:
- All API calls logged and encrypted
- Log file integrity validation
- Multi-region trail for complete coverage
- Integration with CloudWatch for real-time monitoring

#### Security - AWS Config and AWS Inspector
**AWS Config**:
- Compliance rules for HIPAA requirements
- Resource configuration monitoring
- Automatic remediation for non-compliant resources

**AWS Inspector**:
- Automated security assessments
- Vulnerability scanning for EC2 instances
- Integration with security information systems

### 6. Backup and Disaster Recovery

#### Automated Backups - AWS Backup
**Configuration**:
- **Backup Plans**: Scheduled backups for all critical resources
- **Retention**: 7 years for HIPAA compliance
- **Cross-Region Backup**: For disaster recovery
- **Encryption**: All backups encrypted at rest

**Backup Targets**:
- RDS automated backups
- EBS volume snapshots
- Application configuration data

#### Disaster Recovery Strategy
**Recovery Time Objective (RTO)**: 4 hours
**Recovery Point Objective (RPO)**: 1 hour

**Strategy**:
- Multi-AZ deployment for high availability
- Cross-region backup for disaster recovery
- Infrastructure as Code for rapid environment recreation
- Automated failover procedures

## Security Compliance Features

### 1. Encryption
- **At Rest**: All data encrypted using AWS KMS
- **In Transit**: TLS 1.2+ for all communications
- **Application Level**: Additional encryption for PHI data

### 2. Access Control
- **IAM Roles**: Least privilege principle
- **MFA**: Required for all administrative access
- **Service Accounts**: Automated credential rotation
- **Network Segmentation**: Multiple security layers

### 3. Audit and Monitoring
- **CloudTrail**: All API calls logged
- **VPC Flow Logs**: Network traffic monitoring
- **Application Logs**: Centralized in CloudWatch
- **Security Incident Response**: Automated alerting

### 4. Data Governance
- **Data Classification**: PHI vs non-PHI data separation
- **Retention Policies**: HIPAA-compliant data retention
- **Data Loss Prevention**: Automated scanning and alerts
- **Secure Data Destruction**: Cryptographic erasure

## Cost Optimization

### Resource Rightsizing
- **Development Environment**: Smaller instance types
- **Production Environment**: Auto-scaling based on demand
- **Reserved Instances**: For predictable workloads
- **Spot Instances**: For non-critical batch processing

### Estimated Monthly Costs (Production)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| RDS PostgreSQL | db.r5.large, Multi-AZ | $350 |
| ElastiCache Redis | cache.r5.large | $180 |
| ECS Fargate | 4 tasks, 0.5 vCPU, 1GB | $120 |
| Application Load Balancer | | $20 |
| NAT Gateway | 2 AZs | $90 |
| CloudWatch Logs | 50GB/month | $25 |
| AWS Backup | 100GB storage | $50 |
| Data Transfer | 500GB/month | $45 |
| **Total Estimated** | | **$880/month** |

*Note: Costs may vary based on actual usage patterns and AWS pricing changes*

## Deployment Strategy

### 1. Environment Strategy
- **Development**: Single AZ, smaller instances
- **Staging**: Production-like configuration
- **Production**: Full multi-AZ, high availability

### 2. Infrastructure as Code
- **Terraform**: Infrastructure provisioning
- **AWS CloudFormation**: Service-specific deployments
- **Ansible**: Configuration management
- **GitOps**: Version-controlled infrastructure

### 3. CI/CD Pipeline
- **Source Control**: GitHub with branch protection
- **Build Pipeline**: GitHub Actions
- **Infrastructure Deployment**: Terraform Cloud
- **Application Deployment**: ECS rolling deployments

## Security Best Practices

### 1. Network Security
- No direct SSH access to production instances
- Bastion host for emergency access only
- VPN connection for administrative access
- Regular security group audits

### 2. Application Security
- Container image scanning
- Dependency vulnerability scanning
- Runtime security monitoring
- Regular penetration testing

### 3. Data Security
- Encryption key rotation
- Secure secrets management
- Data masking in non-production environments
- Regular access reviews

## Compliance and Governance

### 1. HIPAA Compliance Checklist
- ✅ Business Associate Agreement with AWS
- ✅ Encryption at rest and in transit
- ✅ Access controls and audit logging
- ✅ Incident response procedures
- ✅ Risk assessment documentation
- ✅ Employee training programs

### 2. Ongoing Compliance
- Quarterly security assessments
- Annual HIPAA risk assessments
- Regular compliance audits
- Continuous monitoring and alerting

## Next Steps

1. **Phase 1**: VPC and networking setup
2. **Phase 2**: Database and cache deployment
3. **Phase 3**: Application platform configuration
4. **Phase 4**: Monitoring and security setup
5. **Phase 5**: Backup and disaster recovery implementation
6. **Phase 6**: Production deployment and testing