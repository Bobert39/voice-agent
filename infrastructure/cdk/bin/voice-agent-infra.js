#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const vpc_stack_1 = require("../lib/vpc-stack");
const database_stack_1 = require("../lib/database-stack");
const security_stack_1 = require("../lib/security-stack");
const monitoring_stack_1 = require("../lib/monitoring-stack");
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
const securityStack = new security_stack_1.VoiceAgentSecurityStack(app, `${stackPrefix}-Security`, {
    env,
    tags: hipaaComplianceTags,
    description: 'HIPAA-compliant security infrastructure including KMS keys and IAM roles'
});
// VPC Stack
const vpcStack = new vpc_stack_1.VoiceAgentVpcStack(app, `${stackPrefix}-VPC`, {
    env,
    tags: hipaaComplianceTags,
    description: 'HIPAA-compliant VPC with private subnets and security groups'
});
// Database Stack
const databaseStack = new database_stack_1.VoiceAgentDatabaseStack(app, `${stackPrefix}-Database`, {
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
const monitoringStack = new monitoring_stack_1.VoiceAgentMonitoringStack(app, `${stackPrefix}-Monitoring`, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pY2UtYWdlbnQtaW5mcmEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2b2ljZS1hZ2VudC1pbmZyYS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBQ25DLGdEQUFzRDtBQUN0RCwwREFBZ0U7QUFDaEUsMERBQWdFO0FBQ2hFLDhEQUFvRTtBQUVwRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQixnQ0FBZ0M7QUFDaEMsTUFBTSxHQUFHLEdBQUc7SUFDVixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7SUFDeEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVztDQUN0RCxDQUFDO0FBRUYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDO0FBQ25FLE1BQU0sV0FBVyxHQUFHLGNBQWMsV0FBVyxFQUFFLENBQUM7QUFFaEQsb0RBQW9EO0FBQ3BELE1BQU0sbUJBQW1CLEdBQUc7SUFDMUIsT0FBTyxFQUFFLFlBQVk7SUFDckIsV0FBVyxFQUFFLFdBQVc7SUFDeEIsa0JBQWtCLEVBQUUsS0FBSztJQUN6QixjQUFjLEVBQUUsTUFBTTtJQUN0QixjQUFjLEVBQUUsTUFBTTtJQUN0QixrQkFBa0IsRUFBRSxNQUFNO0lBQzFCLEtBQUssRUFBRSxnQkFBZ0I7Q0FDeEIsQ0FBQztBQUVGLDZDQUE2QztBQUM3QyxNQUFNLGFBQWEsR0FBRyxJQUFJLHdDQUF1QixDQUFDLEdBQUcsRUFBRSxHQUFHLFdBQVcsV0FBVyxFQUFFO0lBQ2hGLEdBQUc7SUFDSCxJQUFJLEVBQUUsbUJBQW1CO0lBQ3pCLFdBQVcsRUFBRSwwRUFBMEU7Q0FDeEYsQ0FBQyxDQUFDO0FBRUgsWUFBWTtBQUNaLE1BQU0sUUFBUSxHQUFHLElBQUksOEJBQWtCLENBQUMsR0FBRyxFQUFFLEdBQUcsV0FBVyxNQUFNLEVBQUU7SUFDakUsR0FBRztJQUNILElBQUksRUFBRSxtQkFBbUI7SUFDekIsV0FBVyxFQUFFLDhEQUE4RDtDQUM1RSxDQUFDLENBQUM7QUFFSCxpQkFBaUI7QUFDakIsTUFBTSxhQUFhLEdBQUcsSUFBSSx3Q0FBdUIsQ0FBQyxHQUFHLEVBQUUsR0FBRyxXQUFXLFdBQVcsRUFBRTtJQUNoRixHQUFHO0lBQ0gsSUFBSSxFQUFFLG1CQUFtQjtJQUN6QixXQUFXLEVBQUUseURBQXlEO0lBQ3RFLEdBQUcsRUFBRSxRQUFRLENBQUMsR0FBRztJQUNqQixNQUFNLEVBQUUsYUFBYSxDQUFDLFNBQVM7Q0FDaEMsQ0FBQyxDQUFDO0FBRUgsbUJBQW1CO0FBQ25CLGFBQWEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDdEMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUUzQyxtQkFBbUI7QUFDbkIsTUFBTSxlQUFlLEdBQUcsSUFBSSw0Q0FBeUIsQ0FBQyxHQUFHLEVBQUUsR0FBRyxXQUFXLGFBQWEsRUFBRTtJQUN0RixHQUFHO0lBQ0gsSUFBSSxFQUFFLG1CQUFtQjtJQUN6QixXQUFXLEVBQUUscURBQXFEO0lBQ2xFLEdBQUcsRUFBRSxRQUFRLENBQUMsR0FBRztJQUNqQixVQUFVLEVBQUUsYUFBYSxDQUFDLFVBQVU7SUFDcEMsWUFBWSxFQUFFLGFBQWEsQ0FBQyxZQUFZO0NBQ3pDLENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUM7QUFFN0MsK0JBQStCO0FBQy9CLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFO0lBQy9CLEtBQUssRUFBRSxHQUFHLENBQUMsTUFBTSxJQUFJLFdBQVc7SUFDaEMsV0FBVyxFQUFFLDJCQUEyQjtDQUN6QyxDQUFDLENBQUM7QUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtJQUNwQyxLQUFLLEVBQUUsV0FBVztJQUNsQixXQUFXLEVBQUUscUNBQXFDO0NBQ25ELENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBWb2ljZUFnZW50VnBjU3RhY2sgfSBmcm9tICcuLi9saWIvdnBjLXN0YWNrJztcbmltcG9ydCB7IFZvaWNlQWdlbnREYXRhYmFzZVN0YWNrIH0gZnJvbSAnLi4vbGliL2RhdGFiYXNlLXN0YWNrJztcbmltcG9ydCB7IFZvaWNlQWdlbnRTZWN1cml0eVN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IFZvaWNlQWdlbnRNb25pdG9yaW5nU3RhY2sgfSBmcm9tICcuLi9saWIvbW9uaXRvcmluZy1zdGFjayc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIEdldCBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG5jb25zdCBlbnYgPSB7XG4gIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy13ZXN0LTInXG59O1xuXG5jb25zdCBlbnZpcm9ubWVudCA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vudmlyb25tZW50JykgfHwgJ2Rldic7XG5jb25zdCBzdGFja1ByZWZpeCA9IGBWb2ljZUFnZW50LSR7ZW52aXJvbm1lbnR9YDtcblxuLy8gVGFncyBmb3IgSElQQUEgY29tcGxpYW5jZSBhbmQgcmVzb3VyY2UgbWFuYWdlbWVudFxuY29uc3QgaGlwYWFDb21wbGlhbmNlVGFncyA9IHtcbiAgUHJvamVjdDogJ1ZvaWNlQWdlbnQnLFxuICBFbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gIERhdGFDbGFzc2lmaWNhdGlvbjogJ1BISScsXG4gIEhJUEFBQ29tcGxpYW50OiAndHJ1ZScsXG4gIEJhY2t1cFJlcXVpcmVkOiAndHJ1ZScsXG4gIE1vbml0b3JpbmdSZXF1aXJlZDogJ3RydWUnLFxuICBPd25lcjogJ0NhcGl0b2xFeWVDYXJlJ1xufTtcblxuLy8gU2VjdXJpdHkgU3RhY2sgKEtNUyBrZXlzLCBJQU0gcm9sZXMsIGV0Yy4pXG5jb25zdCBzZWN1cml0eVN0YWNrID0gbmV3IFZvaWNlQWdlbnRTZWN1cml0eVN0YWNrKGFwcCwgYCR7c3RhY2tQcmVmaXh9LVNlY3VyaXR5YCwge1xuICBlbnYsXG4gIHRhZ3M6IGhpcGFhQ29tcGxpYW5jZVRhZ3MsXG4gIGRlc2NyaXB0aW9uOiAnSElQQUEtY29tcGxpYW50IHNlY3VyaXR5IGluZnJhc3RydWN0dXJlIGluY2x1ZGluZyBLTVMga2V5cyBhbmQgSUFNIHJvbGVzJ1xufSk7XG5cbi8vIFZQQyBTdGFja1xuY29uc3QgdnBjU3RhY2sgPSBuZXcgVm9pY2VBZ2VudFZwY1N0YWNrKGFwcCwgYCR7c3RhY2tQcmVmaXh9LVZQQ2AsIHtcbiAgZW52LFxuICB0YWdzOiBoaXBhYUNvbXBsaWFuY2VUYWdzLFxuICBkZXNjcmlwdGlvbjogJ0hJUEFBLWNvbXBsaWFudCBWUEMgd2l0aCBwcml2YXRlIHN1Ym5ldHMgYW5kIHNlY3VyaXR5IGdyb3Vwcydcbn0pO1xuXG4vLyBEYXRhYmFzZSBTdGFja1xuY29uc3QgZGF0YWJhc2VTdGFjayA9IG5ldyBWb2ljZUFnZW50RGF0YWJhc2VTdGFjayhhcHAsIGAke3N0YWNrUHJlZml4fS1EYXRhYmFzZWAsIHtcbiAgZW52LFxuICB0YWdzOiBoaXBhYUNvbXBsaWFuY2VUYWdzLFxuICBkZXNjcmlwdGlvbjogJ0hJUEFBLWNvbXBsaWFudCBkYXRhYmFzZSBpbmZyYXN0cnVjdHVyZSB3aXRoIGVuY3J5cHRpb24nLFxuICB2cGM6IHZwY1N0YWNrLnZwYyxcbiAga21zS2V5OiBzZWN1cml0eVN0YWNrLnJkc0ttc0tleVxufSk7XG5cbi8vIEFkZCBkZXBlbmRlbmNpZXNcbmRhdGFiYXNlU3RhY2suYWRkRGVwZW5kZW5jeSh2cGNTdGFjayk7XG5kYXRhYmFzZVN0YWNrLmFkZERlcGVuZGVuY3koc2VjdXJpdHlTdGFjayk7XG5cbi8vIE1vbml0b3JpbmcgU3RhY2tcbmNvbnN0IG1vbml0b3JpbmdTdGFjayA9IG5ldyBWb2ljZUFnZW50TW9uaXRvcmluZ1N0YWNrKGFwcCwgYCR7c3RhY2tQcmVmaXh9LU1vbml0b3JpbmdgLCB7XG4gIGVudixcbiAgdGFnczogaGlwYWFDb21wbGlhbmNlVGFncyxcbiAgZGVzY3JpcHRpb246ICdISVBBQS1jb21wbGlhbnQgbW9uaXRvcmluZyBhbmQgY29tcGxpYW5jZSBkYXNoYm9hcmQnLFxuICB2cGM6IHZwY1N0YWNrLnZwYyxcbiAgcmRzQ2x1c3RlcjogZGF0YWJhc2VTdGFjay5yZHNDbHVzdGVyLFxuICByZWRpc0NsdXN0ZXI6IGRhdGFiYXNlU3RhY2sucmVkaXNDbHVzdGVyXG59KTtcblxubW9uaXRvcmluZ1N0YWNrLmFkZERlcGVuZGVuY3koZGF0YWJhc2VTdGFjayk7XG5cbi8vIE91dHB1dCBpbXBvcnRhbnQgaW5mb3JtYXRpb25cbm5ldyBjZGsuQ2ZuT3V0cHV0KGFwcCwgJ1JlZ2lvbicsIHtcbiAgdmFsdWU6IGVudi5yZWdpb24gfHwgJ3VzLXdlc3QtMicsXG4gIGRlc2NyaXB0aW9uOiAnQVdTIFJlZ2lvbiBmb3IgZGVwbG95bWVudCdcbn0pO1xuXG5uZXcgY2RrLkNmbk91dHB1dChhcHAsICdFbnZpcm9ubWVudCcsIHtcbiAgdmFsdWU6IGVudmlyb25tZW50LFxuICBkZXNjcmlwdGlvbjogJ0Vudmlyb25tZW50IG5hbWUgKGRldi9zdGFnaW5nL3Byb2QpJ1xufSk7Il19