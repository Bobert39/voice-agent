# Variables for HIPAA-Compliant AWS Infrastructure

# General Configuration
variable "aws_region" {
  description = "AWS region for infrastructure deployment"
  type        = string
  default     = "us-east-1"
  
  validation {
    condition = contains([
      "us-east-1", "us-west-2", "us-gov-east-1", "us-gov-west-1"
    ], var.aws_region)
    error_message = "Region must be HIPAA-eligible (us-east-1, us-west-2, us-gov-east-1, us-gov-west-1)."
  }
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  
  validation {
    condition = contains([
      "development", "dev", "staging", "stage", "production", "prod"
    ], var.environment)
    error_message = "Environment must be one of: development, dev, staging, stage, production, prod."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "voice-agent"
  
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
  
  validation {
    condition = contains([
      "db.t3.micro", "db.t3.small", "db.t3.medium", "db.t3.large",
      "db.r5.large", "db.r5.xlarge", "db.r5.2xlarge"
    ], var.db_instance_class)
    error_message = "DB instance class must be a valid RDS instance type."
  }
}

variable "db_name" {
  description = "Name of the database"
  type        = string
  default     = "voiceagent"
  
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.db_name))
    error_message = "Database name must start with a letter and contain only letters, numbers, and underscores."
  }
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "dbadmin"
  
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.db_username))
    error_message = "Database username must start with a letter and contain only letters, numbers, and underscores."
  }
}

variable "db_allocated_storage" {
  description = "Initial allocated storage for RDS in GB"
  type        = number
  default     = 100
  
  validation {
    condition     = var.db_allocated_storage >= 20 && var.db_allocated_storage <= 65536
    error_message = "Allocated storage must be between 20 and 65536 GB."
  }
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for RDS auto-scaling in GB"
  type        = number
  default     = 1000
  
  validation {
    condition     = var.db_max_allocated_storage >= var.db_allocated_storage
    error_message = "Maximum allocated storage must be greater than or equal to allocated storage."
  }
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
  
  validation {
    condition = contains([
      "cache.t3.micro", "cache.t3.small", "cache.t3.medium",
      "cache.r5.large", "cache.r5.xlarge", "cache.r5.2xlarge"
    ], var.redis_node_type)
    error_message = "Redis node type must be a valid ElastiCache instance type."
  }
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the Redis cluster"
  type        = number
  default     = 2
  
  validation {
    condition     = var.redis_num_cache_nodes >= 1 && var.redis_num_cache_nodes <= 6
    error_message = "Number of cache nodes must be between 1 and 6."
  }
}

# Application Configuration
variable "app_port" {
  description = "Port for application containers"
  type        = number
  default     = 8080
  
  validation {
    condition     = var.app_port >= 1024 && var.app_port <= 65535
    error_message = "Application port must be between 1024 and 65535."
  }
}

variable "app_cpu" {
  description = "CPU units for application containers (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
  
  validation {
    condition = contains([256, 512, 1024, 2048, 4096], var.app_cpu)
    error_message = "CPU units must be one of: 256, 512, 1024, 2048, 4096."
  }
}

variable "app_memory" {
  description = "Memory (MB) for application containers"
  type        = number
  default     = 1024
  
  validation {
    condition     = var.app_memory >= 512 && var.app_memory <= 30720
    error_message = "Memory must be between 512 and 30720 MB."
  }
}

variable "app_desired_count" {
  description = "Desired number of application containers"
  type        = number
  default     = 2
  
  validation {
    condition     = var.app_desired_count >= 1 && var.app_desired_count <= 10
    error_message = "Desired count must be between 1 and 10."
  }
}

# Monitoring and Alerting
variable "alert_email" {
  description = "Email address for CloudWatch alerts"
  type        = string
  default     = ""
  
  validation {
    condition = var.alert_email == "" || can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.alert_email))
    error_message = "Alert email must be a valid email address or empty string."
  }
}

variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring"
  type        = bool
  default     = true
}

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 30
  
  validation {
    condition = contains([
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653
    ], var.cloudwatch_log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch retention period."
  }
}

# Security Configuration
variable "enable_deletion_protection" {
  description = "Enable deletion protection for critical resources"
  type        = bool
  default     = true
}

variable "enable_vpc_flow_logs" {
  description = "Enable VPC Flow Logs"
  type        = bool
  default     = true
}

variable "enable_cloudtrail" {
  description = "Enable AWS CloudTrail"
  type        = bool
  default     = true
}

variable "ssl_certificate_domain" {
  description = "Domain name for SSL certificate (leave empty to create self-signed)"
  type        = string
  default     = ""
}

# Backup Configuration
variable "backup_retention_days" {
  description = "Number of days to retain backups (HIPAA requires 7 years = 2555 days)"
  type        = number
  default     = 2555
  
  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 2555
    error_message = "Backup retention must be between 7 and 2555 days (7 years for HIPAA compliance)."
  }
}

variable "enable_cross_region_backup" {
  description = "Enable cross-region backup for disaster recovery"
  type        = bool
  default     = false
}

# Network Configuration
variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnet internet access"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway to save costs (not recommended for production)"
  type        = bool
  default     = false
}

# Cost Optimization
variable "enable_spot_instances" {
  description = "Enable spot instances for non-critical workloads"
  type        = bool
  default     = false
}

variable "enable_reserved_instances" {
  description = "Use reserved instances for predictable workloads"
  type        = bool
  default     = false
}

# Compliance Configuration
variable "hipaa_compliant" {
  description = "Enable HIPAA compliance features"
  type        = bool
  default     = true
}

variable "encryption_at_rest" {
  description = "Enable encryption at rest for all storage"
  type        = bool
  default     = true
}

variable "encryption_in_transit" {
  description = "Enable encryption in transit for all communications"
  type        = bool
  default     = true
}

variable "audit_logging" {
  description = "Enable comprehensive audit logging"
  type        = bool
  default     = true
}

# Feature Flags
variable "enable_auto_scaling" {
  description = "Enable auto-scaling for application services"
  type        = bool
  default     = true
}

variable "enable_load_balancer_logs" {
  description = "Enable access logs for load balancer"
  type        = bool
  default     = true
}

variable "enable_container_insights" {
  description = "Enable CloudWatch Container Insights for ECS"
  type        = bool
  default     = true
}

# Development/Testing Configuration
variable "create_test_data" {
  description = "Create test data for development environments"
  type        = bool
  default     = false
}

variable "enable_debug_mode" {
  description = "Enable debug mode for applications"
  type        = bool
  default     = false
}

# Voice Agent Specific Configuration
variable "twilio_account_sid" {
  description = "Twilio Account SID (stored in Secrets Manager)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API Key (stored in Secrets Manager)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "elevenlabs_api_key" {
  description = "ElevenLabs API Key (stored in Secrets Manager)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "openemr_base_url" {
  description = "OpenEMR base URL for API integration"
  type        = string
  default     = ""
  
  validation {
    condition = var.openemr_base_url == "" || can(regex("^https://", var.openemr_base_url))
    error_message = "OpenEMR base URL must start with https:// or be empty."
  }
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "cost_center" {
  description = "Cost center for billing allocation"
  type        = string
  default     = "IT-Healthcare"
}

variable "data_classification" {
  description = "Data classification level"
  type        = string
  default     = "PHI"
  
  validation {
    condition = contains([
      "Public", "Internal", "Confidential", "PHI", "PII"
    ], var.data_classification)
    error_message = "Data classification must be one of: Public, Internal, Confidential, PHI, PII."
  }
}