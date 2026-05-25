import { Controller, Get, Inject } from "@nestjs/common";
import { Queue } from "bullmq";

@Controller({ path: "queues", version: "1" })
export class QueuesController {
  constructor(
    @Inject("QUEUES") private readonly queues: { name: string; queue: Queue }[]
  ) {}

  @Get()
  async list() {
    const results: Record<string, unknown> = {};
    for (const { name, queue } of this.queues) {
      const [counts, jobs] = await Promise.all([
        queue.getJobCounts(),
        queue.getJobs(["failed"], 0, 10)
      ]);
      results[name] = {
        ...counts,
        latestFailures: jobs.map((j) => ({
          id: j.id,
          failedReason: j.failedReason,
          timestamp: j.timestamp
        }))
      };
    }
    return results;
  }
}
