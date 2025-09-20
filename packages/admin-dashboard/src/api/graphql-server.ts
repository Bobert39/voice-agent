/**
 * GraphQL Server with WebSocket Subscriptions
 * Integrates with Express server for dashboard API
 */

import { ApolloServer } from 'apollo-server-express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { resolvers, simulateRealTimeEvents } from './resolvers';
import jwt from 'jsonwebtoken';

// Create executable schema
const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

// Authentication context function
const getContext = async ({ req }: { req: any }) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return { user: null };
    }

    // In production, verify JWT token
    // const decoded = jwt.verify(token, process.env.JWT_SECRET!);

    // For demo, return mock user
    const mockUser = {
      id: 'user-001',
      name: 'Jane Doe',
      role: 'supervisor',
    };

    return { user: mockUser };
  } catch (error) {
    console.error('Auth error:', error);
    return { user: null };
  }
};

// WebSocket context function
const getWSContext = (ctx: any) => {
  try {
    const token = ctx.connectionParams?.authorization?.replace('Bearer ', '');
    if (!token) {
      return { user: null };
    }

    // For demo, return mock user
    const mockUser = {
      id: 'user-001',
      name: 'Jane Doe',
      role: 'supervisor',
    };

    return { user: mockUser };
  } catch (error) {
    console.error('WS Auth error:', error);
    return { user: null };
  }
};

export const createGraphQLServer = async (app: any) => {
  // Create Apollo Server
  const apolloServer = new ApolloServer({
    schema,
    context: getContext,
    introspection: process.env.NODE_ENV !== 'production',
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              // Drain the WebSocket server when Apollo Server stops
            },
          };
        },
      },
    ],
  });

  await apolloServer.start();

  // Apply middleware to Express app
  apolloServer.applyMiddleware({
    app,
    path: '/graphql',
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    },
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // Create WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Setup GraphQL WebSocket server
  const serverCleanup = useServer(
    {
      schema,
      context: getWSContext,
      onConnect: (ctx) => {
        console.log('Client connected to GraphQL subscriptions');
        return true;
      },
      onDisconnect: () => {
        console.log('Client disconnected from GraphQL subscriptions');
      },
      onError: (ctx, msg, errors) => {
        console.error('GraphQL subscription error:', errors);
      },
    },
    wsServer
  );

  // Start simulation of real-time events for demo
  if (process.env.NODE_ENV !== 'production') {
    simulateRealTimeEvents();
  }

  return {
    httpServer,
    apolloServer,
    wsServer,
    serverCleanup,
  };
};