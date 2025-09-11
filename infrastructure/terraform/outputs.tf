# Outputs for HIPAA-Compliant AWS Infrastructure

# VPC and Networking Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "IDs of the database subnets"
  value       = aws_subnet.database[*].id
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "nat_gateway_ids" {
  description = "IDs of the NAT Gateways"
  value       = aws_nat_gateway.main[*].id
}

# Security Group Outputs
output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "ID of the application security group"
  value       = aws_security_group.app.id
}

output "database_security_group_id" {
  description = "ID of the database security group"
  value       = aws_security_group.database.id
}

output "redis_security_group_id" {
  description = "ID of the Redis security group"
  value       = aws_security_group.redis.id
}

# Database Outputs
output "database_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "database_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "database_username" {
  description = "Database master username"
  value       = aws_db_instance.main.username
  sensitive   = true
}

output "database_password_secret_arn" {
  description = "ARN of the secret containing database password"
  value       = aws_secretsmanager_secret.db_password.arn
}

output "database_identifier" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}

output "database_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.main.arn
}

# Redis Outputs
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "Redis cluster port"
  value       = aws_elasticache_replication_group.redis.port
}

output "redis_auth_token_secret_arn" {
  description = "ARN of the secret containing Redis AUTH token"
  value       = aws_secretsmanager_secret.redis_auth.arn
}

output "redis_cluster_id" {
  description = "Redis cluster identifier"
  value       = aws_elasticache_replication_group.redis.replication_group_id
}

# KMS Key Outputs
output "kms_key_id" {
  description = "ID of the KMS key for encryption"
  value       = aws_kms_key.main.key_id
}

output "kms_key_arn" {
  description = "ARN of the KMS key for encryption"
  value       = aws_kms_key.main.arn
}

output "kms_alias_name" {
  description = "Alias name of the KMS key"
  value       = aws_kms_alias.main.name
}

# Monitoring and Logging Outputs
output "vpc_flow_logs_group_arn" {
  description = "ARN of the VPC Flow Logs CloudWatch group"
  value       = aws_cloudwatch_log_group.vpc_flow_logs.arn
}

output "rds_log_group_arn" {
  description = "ARN of the RDS CloudWatch log group"
  value       = aws_cloudwatch_log_group.rds.arn
}

output "redis_log_group_arn" {
  description = "ARN of the Redis CloudWatch log group"
  value       = aws_cloudwatch_log_group.redis_slow.arn
}

# Backup Outputs
output "backup_vault_arn" {
  description = "ARN of the AWS Backup vault"
  value       = aws_backup_vault.main.arn
}

output "backup_plan_arn" {
  description = "ARN of the AWS Backup plan"
  value       = aws_backup_plan.main.arn
}

# SNS Topic Outputs (Production only)
output "alerts_topic_arn" {
  description = "ARN of the SNS topic for alerts"
  value       = var.environment == "production" ? aws_sns_topic.alerts[0].arn : null
}

# Availability Zones
output "availability_zones" {
  description = "List of availability zones used"
  value       = local.azs
}

# Environment Information
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "project_name" {
  description = "Project name"
  value       = var.project_name
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

# Connection Strings (for application configuration)
output "database_connection_string_template" {
  description = "Template for database connection string (replace password)"
  value       = "postgresql://${aws_db_instance.main.username}:PASSWORD@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}?sslmode=require"
  sensitive   = true
}

output "redis_connection_string_template" {
  description = "Template for Redis connection string (replace auth token)"
  value       = "redis://AUTH_TOKEN@${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
  sensitive   = true
}

# Resource Tags
output "common_tags" {
  description = "Common tags applied to all resources"
  value       = local.common_tags
}

# Cost Tracking
output "resource_summary" {
  description = "Summary of created resources for cost tracking"
  value = {
    vpc_id                = aws_vpc.main.id
    database_instance     = aws_db_instance.main.instance_class
    redis_nodes          = var.redis_num_cache_nodes
    redis_node_type      = var.redis_node_type
    nat_gateways         = length(aws_nat_gateway.main)
    environment          = var.environment
    multi_az_enabled     = aws_db_instance.main.multi_az
    backup_enabled       = true
    encryption_enabled   = true
  }
}

# Security Information
output "security_configuration" {
  description = "Security configuration summary"
  value = {
    encryption_at_rest   = true
    encryption_in_transit = true
    kms_key_rotation     = true
    vpc_flow_logs        = true
    multi_az_database    = aws_db_instance.main.multi_az
    backup_retention     = aws_db_instance.main.backup_retention_period
    deletion_protection  = aws_db_instance.main.deletion_protection
  }
}

# Compliance Information
output "hipaa_compliance_features" {
  description = "HIPAA compliance features enabled"
  value = {
    encryption_at_rest          = true
    encryption_in_transit       = true
    audit_logging              = true
    backup_retention_years     = aws_db_instance.main.backup_retention_period / 365
    kms_key_rotation           = true
    vpc_isolation              = true
    security_groups_configured = true
    monitoring_enabled         = true
    deletion_protection        = aws_db_instance.main.deletion_protection
  }
}

# Quick Start Information
output "deployment_guide" {
  description = "Quick deployment guide for applications"
  value = {
    next_steps = [
      "1. Deploy ECS cluster and services using the provided security groups",
      "2. Configure application with database and Redis connection strings from Secrets Manager",
      "3. Set up Application Load Balancer in public subnets",
      "4. Configure DNS and SSL certificates",
      "5. Deploy monitoring and alerting",
      "6. Test backup and recovery procedures"
    ]
    security_groups = {
      alb = aws_security_group.alb.id
      app = aws_security_group.app.id
      database = aws_security_group.database.id
      redis = aws_security_group.redis.id
    }
    subnets = {
      public   = aws_subnet.public[*].id
      private  = aws_subnet.private[*].id
      database = aws_subnet.database[*].id
    }
  }
}