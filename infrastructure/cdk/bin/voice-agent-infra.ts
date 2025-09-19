#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VoiceAgentVpcStack } from '../lib/vpc-stack';
import { VoiceAgentDatabaseStack } from '../lib/database-stack';
import { VoiceAgentSecurityStack } from '../lib/security-stack';
import { VoiceAgentMonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

// Get environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-west-2'
};

const environment = app.node.tryGetContext('environment') || 'dev';
const stackPrefix = `VoiceAgent-${environment}`;

// Tags for HIPAA compliance and resource management
const hipaaComplianceTags = {
  Project: 'VoiceAgent',
  Environment: environment,
  DataClassification: 'PHI',
  HIPAACompliant: 'true',
  BackupRequired: 'true',
  MonitoringRequired: 'true',
  Owner: 'CapitolEyeCare'
};

// Security Stack (KMS keys, IAM roles, etc.)
const securityStack = new VoiceAgentSecurityStack(app, `${stackPrefix}-Security`, {
  env,
  tags: hipaaComplianceTags,
  description: 'HIPAA-compliant security infrastructure including KMS keys and IAM roles'
});

// VPC Stack
const vpcStack = new VoiceAgentVpcStack(app, `${stackPrefix}-VPC`, {
  env,
  tags: hipaaComplianceTags,
  description: 'HIPAA-compliant VPC with private subnets and security groups'
});

// Database Stack
const databaseStack = new VoiceAgentDatabaseStack(app, `${stackPrefix}-Database`, {
  env,
  tags: hipaaComplianceTags,
  description: 'HIPAA-compliant database infrastructure with encryption',
  vpc: vpcStack.vpc,
  kmsKey: securityStack.rdsKmsKey
});

// Add dependencies
databaseStack.addDependency(vpcStack);
databaseStack.addDependency(securityStack);

// Monitoring Stack
const monitoringStack = new VoiceAgentMonitoringStack(app, `${stackPrefix}-Monitoring`, {
  env,
  tags: hipaaComplianceTags,
  description: 'HIPAA-compliant monitoring and compliance dashboard',
  vpc: vpcStack.vpc,
  rdsCluster: databaseStack.rdsCluster,
  redisCluster: databaseStack.redisCluster
});

monitoringStack.addDependency(databaseStack);

// Output important information
new cdk.CfnOutput(app, 'Region', {
  value: env.region || 'us-west-2',
  description: 'AWS Region for deployment'
});

new cdk.CfnOutput(app, 'Environment', {
  value: environment,
  description: 'Environment name (dev/staging/prod)'
});