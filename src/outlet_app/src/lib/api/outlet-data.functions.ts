import { createServerFn } from "@tanstack/react-start";

export const getOutletDataset = createServerFn({ method: "POST" }).handler(async () => {
  const { loadOutletDataset } = await import("../outlet-data.server");
  return loadOutletDataset();
});