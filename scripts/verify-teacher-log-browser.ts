import fs from "node:fs/promises";
import path from "node:path";

import { listTeacherLogs } from "../src/lib/system/logs";

async function main() {
  const teacherId = `verify-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const relativePath = `teachers/teacher_${teacherId}/log-test.log`;
  const absolutePath = path.join(process.cwd(), "logs", relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `teacher log verification ${teacherId}\n`, "utf8");

  try {
    const logs = await listTeacherLogs(teacherId);

    console.log(
      JSON.stringify(
        {
          teacherId,
          total: logs.length,
          hasExpectedLog: logs.some((entry) => entry.relativePath === relativePath),
          paths: logs.map((entry) => entry.relativePath),
        },
        null,
        2,
      ),
    );
  } finally {
    await fs.rm(path.join(process.cwd(), "logs", `teachers/teacher_${teacherId}`), {
      recursive: true,
      force: true,
    });
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
