type OfflineJob = {
  id: string;
  path: string;
  method: string;
  body: unknown;
  createdAt: string;
};

const STORAGE_KEY = "vendra.offlineQueue";

export function enqueueOfflineJob(job: Omit<OfflineJob, "id" | "createdAt">) {
  if (typeof window === "undefined") return;
  const jobs = readOfflineJobs();
  jobs.push({ ...job, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function readOfflineJobs(): OfflineJob[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as OfflineJob[]) : [];
}

export function clearOfflineJob(id: string) {
  const jobs = readOfflineJobs().filter((job) => job.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}
