import { catalogue, sources, createRuntime, createCrawlClient } from "..";
import type { Opportunity, Snapshot } from "..";

const snapshot: Snapshot = catalogue.store.empty();
const matches: Opportunity[] = catalogue.search(snapshot, {
  kind: "scheme",
  age: 22,
});
const app = catalogue.createServer({ catalogue: snapshot });
const client = createCrawlClient(createRuntime({ timeoutMs: 1000 }), {
  domain: "sarkariresult.com",
});
const parser = sources.requireListParser("sarkariresult.com", "jobs");
const parsed = parser.scrapeJobList("<html></html>", parser.jobListUrl);
void [matches, app, client, parsed];
