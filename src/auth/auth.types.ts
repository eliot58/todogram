import { FastifyRequest } from 'fastify';

export type AuthPayload = {
    userId: number;
};

export type RequestWithAuth = FastifyRequest & AuthPayload;