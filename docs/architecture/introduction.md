# Introduction

This document outlines the overall project architecture for **AI Voice Agent for Capitol Eye Care**, including backend systems, shared services, and non-UI specific concerns. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development, ensuring consistency and adherence to chosen patterns and technologies.

**Relationship to Frontend Architecture:**
If the project includes a significant user interface, a separate Frontend Architecture Document will detail the frontend-specific design and MUST be used in conjunction with this document. Core technology stack choices documented herein (see "Tech Stack") are definitive for the entire project, including any frontend components.

## Starter Template or Existing Project

Based on my review of the PRD and project context, I don't see any mention of a starter template or existing codebase. This appears to be a greenfield project being built from scratch.

Given that this is a Node.js/TypeScript microservices project, I could suggest some appropriate starter templates:
- **NestJS** - Enterprise-ready Node.js framework with built-in microservices support
- **Express.js with TypeScript boilerplate** - For more control over architecture
- **Moleculer** - Microservices framework for Node.js

However, since no starter template was mentioned in the PRD and the project requires specific HIPAA-compliant configurations, starting from scratch might give more control over security implementations.

**Decision**: N/A - No starter template mentioned. Project will be built from scratch to ensure full HIPAA compliance control.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|---------|
| 2025-01-10 | 1.0 | Initial architecture document creation | Winston (Architect) |
