import { listAllLogs } from "../src/lib/system/logs";

async function main() {
  const logs = await listAllLogs();

  console.log(
    JSON.stringify(
      {
        total: logs.length,
        hasLegacyFollowManagerLogs: logs.some(
          (entry) => entry.sourceKey === "legacy-follow-manager",
        ),
        hasPlatformLogs: logs.some((entry) => entry.sourceKey === "platform"),
        firstEntries: logs.slice(0, 5).map((entry) => ({
          sourceKey: entry.sourceKey,
          relativePath: entry.relativePath,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
