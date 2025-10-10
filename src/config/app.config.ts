import { registerAs } from "@nestjs/config";

export default registerAs('app', () => ({
    nodeEnv: process.env.NODE_ENV!,
    port: Number(process.env.PORT!),
    jwt_secret: process.env.JWT_SECRET!,
    access_token_expire: "15m",
    refresh_token_expire: "30d",
    sentry_dsn: process.env.SENTRY_DSN!,
    aws_access_key_id: process.env.AWS_ACCESS_KEY_ID!,
    aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY!,
    aws_endpoint: process.env.AWS_ENDPOINT!,
    aws_region: process.env.AWS_REGION!,
    aws_s3_bucket: process.env.AWS_S3_BUCKET!,
    email_host_user: process.env.EMAIL_HOST_USER!,
    email_host_password: process.env.EMAIL_HOST_PASSWORD!,
}));