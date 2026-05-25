import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { QUEUE_NAMES } from "../../queues/queue-names";
import { QueuesController } from "./queues.controller";

const QUEUES = Object.values(QUEUE_NAMES);

@Module({
  imports: [BullModule.registerQueue(...QUEUES.map((name) => ({ name })))],
  controllers: [QueuesController],
  providers: [
    {
      provide: "QUEUES",
      useFactory: (...queues: import("bullmq").Queue[]) =>
        QUEUES.map((name, i) => ({ name, queue: queues[i] })),
      inject: QUEUES.map((name) => getQueueToken(name))
    }
  ]
})
export class QueuesModule {}
