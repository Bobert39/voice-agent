#!/bin/bash

# HIPAA-Compliant Infrastructure Deployment Script
# Capitol Eye Care Voice Agent Infrastructure

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/terraform"
REQUIRED_TOOLS=("terraform" "aws" "jq")

# Default values
ENVIRONMENT="${ENVIRONMENT:-development}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SKIP_VALIDATION="${SKIP_VALIDATION:-false}"
AUTO_APPROVE="${AUTO_APPROVE:-false}"
DESTROY_MODE="${DESTROY_MODE:-false}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    for tool in "${REQUIRED_TOOLS[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is required but not installed. Please install it first."
        fi
    done
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure' first."
    fi
    
    # Check if we're in a HIPAA-eligible region
    if [[ ! "$AWS_REGION" =~ ^(us-east-1|us-west-2|us-gov-east-1|us-gov-west-1)$ ]]; then
        log_error "Region $AWS_REGION is not HIPAA-eligible. Use us-east-1, us-west-2, us-gov-east-1, or us-gov-west-1."
    fi
    
    # Check Terraform version
    TERRAFORM_VERSION=$(terraform version -json | jq -r '.terraform_version')
    log_info "Using Terraform version: $TERRAFORM_VERSION"
    
    log_success "Prerequisites check passed"
}

validate_environment() {
    if [[ "$SKIP_VALIDATION" == "true" ]]; then
        log_warning "Skipping environment validation"
        return
    fi
    
    log_info "Validating environment configuration..."
    
    # Check if terraform.tfvars exists
    if [[ ! -f "$TERRAFORM_DIR/terraform.tfvars" ]]; then
        log_error "terraform.tfvars not found. Copy terraform.tfvars.example and customize it."
    fi
    
    # Validate environment value
    if [[ ! "$ENVIRONMENT" =~ ^(development|dev|staging|stage|production|prod)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT. Must be one of: development, dev, staging, stage, production, prod"
    fi
    
    # Production safety checks
    if [[ "$ENVIRONMENT" =~ ^(production|prod)$ ]]; then
        log_warning "Deploying to PRODUCTION environment!"
        
        if [[ "$AUTO_APPROVE" == "true" ]]; then
            log_error "Auto-approve is not allowed for production deployments"
        fi
        
        echo -n "Are you sure you want to deploy to production? (yes/no): "
        read -r confirmation
        if [[ "$confirmation" != "yes" ]]; then
            log_error "Production deployment cancelled"
        fi
    fi
    
    log_success "Environment validation passed"
}

setup_terraform_backend() {
    log_info "Setting up Terraform backend..."
    
    # Check if backend configuration exists
    if grep -q "backend \"s3\"" "$TERRAFORM_DIR/main.tf"; then
        log_info "S3 backend configuration found"
        
        # Try to initialize with existing backend
        if terraform -chdir="$TERRAFORM_DIR" init -input=false; then
            log_success "Terraform backend initialized"
        else
            log_warning "Backend initialization failed. You may need to configure the S3 backend manually."
        fi
    else
        log_warning "No remote backend configured. State will be stored locally."
        terraform -chdir="$TERRAFORM_DIR" init -input=false
    fi
}

validate_terraform() {
    log_info "Validating Terraform configuration..."
    
    # Format check
    if ! terraform -chdir="$TERRAFORM_DIR" fmt -check=true -diff=true; then
        log_error "Terraform files need formatting. Run 'terraform fmt' first."
    fi
    
    # Validate configuration
    if ! terraform -chdir="$TERRAFORM_DIR" validate; then
        log_error "Terraform configuration validation failed"
    fi
    
    log_success "Terraform validation passed"
}

plan_deployment() {
    log_info "Creating Terraform plan..."
    
    local plan_file="$TERRAFORM_DIR/terraform.tfplan"
    
    # Create plan
    terraform -chdir="$TERRAFORM_DIR" plan \
        -var="environment=$ENVIRONMENT" \
        -var="aws_region=$AWS_REGION" \
        -out="$plan_file" \
        -input=false
    
    log_success "Terraform plan created: $plan_file"
    
    # Show plan summary
    log_info "Plan summary:"
    terraform -chdir="$TERRAFORM_DIR" show -no-color "$plan_file" | grep -E "Plan:|No changes"
}

apply_deployment() {
    log_info "Applying Terraform deployment..."
    
    local plan_file="$TERRAFORM_DIR/terraform.tfplan"
    
    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found. Run plan first."
    fi
    
    # Apply with or without auto-approve
    if [[ "$AUTO_APPROVE" == "true" ]]; then
        terraform -chdir="$TERRAFORM_DIR" apply -input=false "$plan_file"
    else
        echo -n "Do you want to apply this plan? (yes/no): "
        read -r confirmation
        if [[ "$confirmation" == "yes" ]]; then
            terraform -chdir="$TERRAFORM_DIR" apply -input=false "$plan_file"
        else
            log_error "Deployment cancelled"
        fi
    fi
    
    log_success "Terraform deployment completed"
}

destroy_infrastructure() {
    log_warning "DESTROY MODE: This will delete all infrastructure!"
    
    if [[ "$ENVIRONMENT" =~ ^(production|prod)$ ]]; then
        log_error "Destroy mode is not allowed for production environment"
    fi
    
    echo -n "Are you absolutely sure you want to destroy the infrastructure? (yes/no): "
    read -r confirmation
    if [[ "$confirmation" != "yes" ]]; then
        log_error "Destroy cancelled"
    fi
    
    echo -n "Type 'destroy' to confirm: "
    read -r confirm_destroy
    if [[ "$confirm_destroy" != "destroy" ]]; then
        log_error "Destroy cancelled"
    fi
    
    terraform -chdir="$TERRAFORM_DIR" destroy \
        -var="environment=$ENVIRONMENT" \
        -var="aws_region=$AWS_REGION" \
        -input=false
    
    log_success "Infrastructure destroyed"
}

show_outputs() {
    log_info "Deployment outputs:"
    terraform -chdir="$TERRAFORM_DIR" output -json | jq .
}

run_security_scan() {
    log_info "Running security scan..."
    
    # Check if tfsec is available
    if command -v tfsec &> /dev/null; then
        tfsec "$TERRAFORM_DIR" --format json > "$TERRAFORM_DIR/security-scan.json" || true
        log_info "Security scan results saved to security-scan.json"
    else
        log_warning "tfsec not installed. Skipping security scan."
    fi
}

run_cost_estimation() {
    log_info "Running cost estimation..."
    
    # Check if infracost is available
    if command -v infracost &> /dev/null; then
        infracost breakdown --path "$TERRAFORM_DIR" --format json > "$TERRAFORM_DIR/cost-estimate.json" || true
        log_info "Cost estimation saved to cost-estimate.json"
    else
        log_warning "infracost not installed. Skipping cost estimation."
    fi
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f "$TERRAFORM_DIR/terraform.tfplan"
    rm -f "$TERRAFORM_DIR/.terraform.lock.hcl"
}

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy HIPAA-compliant infrastructure for Capitol Eye Care Voice Agent

OPTIONS:
    -e, --environment ENVIRONMENT    Environment to deploy (development|staging|production)
    -r, --region REGION             AWS region (default: us-east-1)
    -a, --auto-approve              Auto-approve Terraform plan (not allowed for production)
    -s, --skip-validation           Skip environment validation
    -d, --destroy                   Destroy infrastructure instead of creating
    -p, --plan-only                 Only create and show plan, don't apply
    -c, --cleanup                   Clean up temporary files
    -h, --help                      Show this help message

EXAMPLES:
    # Deploy development environment
    $0 -e development

    # Deploy to staging with auto-approve
    $0 -e staging -a

    # Deploy to production (requires manual confirmation)
    $0 -e production

    # Plan only (don't apply)
    $0 -e development -p

    # Destroy development environment
    $0 -e development -d

ENVIRONMENT VARIABLES:
    ENVIRONMENT                     Environment name
    AWS_REGION                      AWS region
    SKIP_VALIDATION                 Skip validation (true/false)
    AUTO_APPROVE                    Auto-approve changes (true/false)
    DESTROY_MODE                    Destroy mode (true/false)

EOF
}

# Main execution
main() {
    local plan_only=false
    local cleanup_only=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -r|--region)
                AWS_REGION="$2"
                shift 2
                ;;
            -a|--auto-approve)
                AUTO_APPROVE="true"
                shift
                ;;
            -s|--skip-validation)
                SKIP_VALIDATION="true"
                shift
                ;;
            -d|--destroy)
                DESTROY_MODE="true"
                shift
                ;;
            -p|--plan-only)
                plan_only=true
                shift
                ;;
            -c|--cleanup)
                cleanup_only=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                ;;
        esac
    done
    
    # Print configuration
    log_info "Configuration:"
    log_info "  Environment: $ENVIRONMENT"
    log_info "  AWS Region: $AWS_REGION"
    log_info "  Auto Approve: $AUTO_APPROVE"
    log_info "  Destroy Mode: $DESTROY_MODE"
    echo
    
    # Handle cleanup
    if [[ "$cleanup_only" == "true" ]]; then
        cleanup
        exit 0
    fi
    
    # Main deployment flow
    check_prerequisites
    validate_environment
    setup_terraform_backend
    validate_terraform
    
    # Run security and cost analysis
    run_security_scan
    run_cost_estimation
    
    if [[ "$DESTROY_MODE" == "true" ]]; then
        destroy_infrastructure
    else
        plan_deployment
        
        if [[ "$plan_only" == "false" ]]; then
            apply_deployment
            show_outputs
            
            log_success "Deployment completed successfully!"
            log_info "Next steps:"
            log_info "1. Configure your application with the database and Redis endpoints"
            log_info "2. Set up your domain and SSL certificate"
            log_info "3. Deploy your application containers"
            log_info "4. Configure monitoring and alerting"
            log_info "5. Test backup and recovery procedures"
        fi
    fi
    
    # Cleanup temporary files
    if [[ "$plan_only" == "false" ]]; then
        cleanup
    fi
}

# Execute main function
main "$@"