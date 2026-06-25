import { getTradingRuntime } from "../src/lib/trading/runtime";

async function main() {
  const runtime = getTradingRuntime();
  const before = await runtime.getTeachers();
  const teacher = before[0];

  if (!teacher) {
    throw new Error("No teacher found for runtime verification.");
  }

  const originalTrace = teacher.traceTraderList.map((item) => ({ ...item }));
  const originalRelations = teacher.followRelations.map((item) => ({ ...item }));

  const extraTrace = {
    id: "verify-trader",
    name: "Verify Trader",
    funds: 12,
    traceOrderMode: "fixed" as const,
    fixedFunds: 25,
    tracePerRatio: 0.2,
    stopLossUsdt: 30,
    stopLossPositionValueRate: 0.07,
    followStatus: "following" as const,
    unrealizedProfitSum: 0,
    followProfit: 0,
  };

  const extraRelation = {
    orderId: "verify-order",
    followOrderId: "verify-follow-order",
    followTraderId: originalTrace[0]?.id ?? "EAE06055569E8B1A",
    symbol: "BTCUSDT",
    amount: 0.123,
    positionSide: "long" as const,
    openAvgPrice: 100000,
    markPrice: 100500,
    unrealizedProfit: 61.5,
    updateTime: Date.now(),
    openTime: Date.now(),
  };

  try {
    await runtime.updateTeacherTraceTraders(teacher.id, [...originalTrace, extraTrace]);
    const withExtraTrace = (await runtime.getTeachers()).find((item) => item.id === teacher.id);

    await runtime.updateTeacherFollowRelations(teacher.id, [...originalRelations, extraRelation]);
    const withExtraRelation = (await runtime.getTeachers()).find((item) => item.id === teacher.id);

    await runtime.unfollowTeacherTrader(teacher.id, "verify-trader");
    const afterUnfollow = (await runtime.getTeachers()).find((item) => item.id === teacher.id);

    console.log(
      JSON.stringify(
        {
          teacherId: teacher.id,
          addedTracePresent: !!withExtraTrace?.traceTraderList.find(
            (item) => item.id === "verify-trader",
          ),
          addedRelationPresent: !!withExtraRelation?.followRelations.find(
            (item) => item.orderId === "verify-order",
          ),
          removedTraceSucceeded: !afterUnfollow?.traceTraderList.find(
            (item) => item.id === "verify-trader",
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.updateTeacherTraceTraders(teacher.id, originalTrace);
    await runtime.updateTeacherFollowRelations(teacher.id, originalRelations);
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
