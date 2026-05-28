import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";

async function listenWithRetry(app: INestApplication, port: number, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await app.listen(port);
      return;
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" && attempt < maxRetries) {
        console.warn(`Port ${port} in use, retrying in 1s (attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw err;
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow<string>("WEB_APP_URL"),
    credentials: true
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.enableShutdownHooks();

  await listenWithRetry(app, config.get<number>("PORT", 4000));
}

void bootstrap();
