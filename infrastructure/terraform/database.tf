# Database and Cache Infrastructure
# HIPAA-compliant PostgreSQL RDS and Redis ElastiCache

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

# Store database password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name_prefix}-db-password"
  description             = "Database password for ${local.name_prefix}"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.main.arn

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db_password.result
  })
}

# RDS Parameter Group for HIPAA compliance
resource "aws_db_parameter_group" "main" {
  family = "postgres15"
  name   = "${local.name_prefix}-db-params"

  # HIPAA-compliant parameters
  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries taking longer than 1 second
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_checkpoints"
    value = "1"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "ssl"
    value = "1"
  }

  parameter {
    name  = "ssl_ciphers"
    value = "HIGH:MEDIUM:+3DES:!aNULL"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-parameter-group"
  })
}

# RDS Option Group (if needed for extensions)
resource "aws_db_option_group" "main" {
  name                     = "${local.name_prefix}-db-options"
  option_group_description = "Option group for ${local.name_prefix}"
  engine_name              = "postgres"
  major_engine_version     = "15"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-option-group"
  })
}

# Main RDS PostgreSQL Database
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-database"

  # Engine configuration
  engine                = "postgres"
  engine_version        = "15.4"
  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.main.arn

  # Database configuration
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result
  port     = 5432

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false

  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.main.name
  option_group_name    = aws_db_option_group.main.name

  # Backup configuration (HIPAA compliance)
  backup_retention_period   = 35  # HIPAA requires long retention
  backup_window            = "03:00-04:00"  # UTC
  maintenance_window       = "sun:04:00-sun:05:00"  # UTC
  auto_minor_version_upgrade = true
  delete_automated_backups  = false

  # Multi-AZ for high availability
  multi_az = var.environment == "production" ? true : false

  # Monitoring configuration
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn
  enabled_cloudwatch_logs_exports = [
    "postgresql"
  ]

  # Performance Insights (additional monitoring)
  performance_insights_enabled          = true
  performance_insights_kms_key_id      = aws_kms_key.main.arn
  performance_insights_retention_period = 7

  # Security configuration
  deletion_protection       = var.environment == "production" ? true : false
  skip_final_snapshot      = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name_prefix}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  copy_tags_to_snapshot    = true

  # CA certificate
  ca_cert_identifier = "rds-ca-2019"

  # Network encryption
  apply_immediately = false

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-database"
    Type = "Primary Database"
  })

  lifecycle {
    ignore_changes = [
      password,
      final_snapshot_identifier
    ]
  }

  depends_on = [
    aws_db_parameter_group.main,
    aws_db_option_group.main,
    aws_cloudwatch_log_group.rds
  ]
}

# Enhanced Monitoring IAM Role for RDS
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${local.name_prefix}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch Log Group for RDS
resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/instance/${local.name_prefix}-database/postgresql"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.main.arn

  tags = local.common_tags
}

# Redis Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-subnet-group"
  })
}

# Redis Parameter Group
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7.x"
  name   = "${local.name_prefix}-redis-params"

  # Security and performance parameters
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-parameter-group"
  })
}

# Generate Redis AUTH token
resource "random_password" "redis_auth_token" {
  length  = 64
  special = false  # Redis AUTH tokens should not contain special characters
}

# Store Redis AUTH token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "${local.name_prefix}-redis-auth"
  description             = "Redis AUTH token for ${local.name_prefix}"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.main.arn

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
  })
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Redis cache for ${local.name_prefix}"

  # Node configuration
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  # Cluster configuration
  num_cache_clusters = var.redis_num_cache_nodes
  
  # Network configuration
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Engine configuration
  engine               = "redis"
  engine_version       = "7.0"
  family               = "redis7.x"

  # Security configuration
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result
  kms_key_id                 = aws_kms_key.main.arn

  # Multi-AZ configuration
  multi_az_enabled           = var.environment == "production" ? true : false
  automatic_failover_enabled = var.environment == "production" ? true : false

  # Backup configuration
  snapshot_retention_limit = 7
  snapshot_window         = "03:00-05:00"  # UTC
  maintenance_window      = "sun:05:00-sun:07:00"  # UTC

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  # Auto minor version upgrade
  auto_minor_version_upgrade = true

  # Notification configuration
  notification_topic_arn = var.environment == "production" ? aws_sns_topic.alerts[0].arn : null

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
    Type = "Session Cache"
  })

  lifecycle {
    ignore_changes = [auth_token]
  }

  depends_on = [
    aws_cloudwatch_log_group.redis_slow
  ]
}

# CloudWatch Log Group for Redis
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/redis/${local.name_prefix}/slow-log"
  retention_in_days = 7
  kms_key_id        = aws_kms_key.main.arn

  tags = local.common_tags
}

# SNS Topic for Production Alerts (conditional)
resource "aws_sns_topic" "alerts" {
  count = var.environment == "production" ? 1 : 0
  
  name              = "${local.name_prefix}-alerts"
  kms_master_key_id = aws_kms_key.main.arn

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email_alerts" {
  count = var.environment == "production" ? 1 : 0
  
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Database backup automation using AWS Backup
resource "aws_backup_vault" "main" {
  name        = "${local.name_prefix}-backup-vault"
  kms_key_arn = aws_kms_key.main.arn

  tags = local.common_tags
}

resource "aws_iam_role" "backup_role" {
  name = "${local.name_prefix}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "backup_policy" {
  role       = aws_iam_role.backup_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_plan" "main" {
  name = "${local.name_prefix}-backup-plan"

  rule {
    rule_name         = "daily_backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 ? * * *)"  # Daily at 5 AM UTC

    lifecycle {
      cold_storage_after = 30
      delete_after       = 2555  # 7 years for HIPAA compliance
    }

    recovery_point_tags = local.common_tags
  }

  tags = local.common_tags
}

resource "aws_backup_selection" "rds" {
  iam_role_arn = aws_iam_role.backup_role.arn
  name         = "${local.name_prefix}-rds-backup"
  plan_id      = aws_backup_plan.main.id

  resources = [
    aws_db_instance.main.arn
  ]

  condition {
    string_equals {
      key   = "aws:ResourceTag/BackupEnabled"
      value = "true"
    }
  }
}

# Add backup tags to resources
resource "aws_resourcegroups_group" "backup_resources" {
  name = "${local.name_prefix}-backup-resources"

  resource_query {
    query = jsonencode({
      ResourceTypeFilters = ["AWS::AllSupported"]
      TagFilters = [
        {
          Key    = "BackupEnabled"
          Values = ["true"]
        }
      ]
    })
  }

  tags = local.common_tags
}