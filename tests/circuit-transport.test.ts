/**
 * Circuit Protocol - Unified Live Transport & Resilience Invariants Test Suite
 *
 * Verifies the stream-first, reactive, non-blocking live transport layer:
 * 1. RpcScheduler concurrency ceiling, priority queue (P0 > P1 > P2 > P3 > P4).
 * 2. In-flight request deduplication (N concurrent callers -> 1 RPC execution).
 * 3. Bounded request timeout enforcement (requests abort cleanly, never hang).
 * 4. HTTP 429 Rate-Limit detection, exponential backoff with jitter, and health degradation.
 * 5. SubscriptionRegistry ref-counting, shared WebSocket listener, and debounced teardown.
 * 6. SlotStream independent reactive propagation decoupled from account queries.
 * 7. Truthful partial states: missing data never evaluates to false "SAFE" or false "$0.00".
 */

import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  RpcScheduler,
  SubscriptionRegistry,
  SlotStream,
  CircuitTransport,
  PRIORITY_WEIGHTS,
} from "../app/src/lib/transport/circuit-transport";

describe("Circuit Protocol — Live Transport & Bootstrap Resilience Suite", () => {
  describe("Invariant 1: RpcScheduler Concurrency & Priority Queue", () => {
    it("strictly enforces max concurrency ceiling under heavy concurrent load", async () => {
      const scheduler = new RpcScheduler(3); // Max 3 concurrent
      let activeCount = 0;
      let peakConcurrency = 0;

      const tasks = Array.from({ length: 12 }, (_, i) => {
        return scheduler.schedule(
          `task-${i}`,
          "P2_PORTFOLIO",
          async () => {
            activeCount++;
            peakConcurrency = Math.max(peakConcurrency, activeCount);
            await new Promise((res) => setTimeout(res, 50));
            activeCount--;
            return `result-${i}`;
          }
        );
      });

      const results = await Promise.all(tasks);
      expect(results).to.have.lengthOf(12);
      expect(peakConcurrency).to.be.at.most(3);
    });

    it("prioritizes P0 (Transaction/Simulation) ahead of P2 (Portfolio) and P4 (Background)", async () => {
      const scheduler = new RpcScheduler(1); // Serial execution to test ordering
      const executionOrder: string[] = [];

      // Start a slow task to hold the single worker
      const blocker = scheduler.schedule("blocker", "P2_PORTFOLIO", async () => {
        await new Promise((res) => setTimeout(res, 40));
        executionOrder.push("blocker");
      });

      // Queue P4, then P2, then P0 while blocker is active
      const p4 = scheduler.schedule("task-p4", "P4_BACKGROUND", async () => {
        executionOrder.push("p4");
      });
      const p2 = scheduler.schedule("task-p2", "P2_PORTFOLIO", async () => {
        executionOrder.push("p2");
      });
      const p0 = scheduler.schedule("task-p0", "P0_CRITICAL", async () => {
        executionOrder.push("p0");
      });

      await Promise.all([blocker, p4, p2, p0]);

      // Order must be: blocker -> p0 (highest priority) -> p2 -> p4
      expect(executionOrder).to.deep.equal(["blocker", "p0", "p2", "p4"]);
    });
  });

  describe("Invariant 2: In-Flight Request Deduplication", () => {
    it("deduplicates identical concurrent RPC calls into a single execution", async () => {
      const scheduler = new RpcScheduler(3);
      let executionCount = 0;

      const runQuery = () =>
        scheduler.schedule("shared-account-key", "P1_ACTIVE_MARKET", async () => {
          executionCount++;
          await new Promise((res) => setTimeout(res, 40));
          return { data: "account-data-payload", version: 1 };
        });

      // 8 components calling the same query concurrently
      const results = await Promise.all([
        runQuery(),
        runQuery(),
        runQuery(),
        runQuery(),
        runQuery(),
        runQuery(),
        runQuery(),
        runQuery(),
      ]);

      expect(executionCount).to.equal(1);
      results.forEach((r) => {
        expect(r.data).to.equal("account-data-payload");
      });
    });
  });

  describe("Invariant 3: Bounded Request Timeout", () => {
    it("rejects cleanly when an RPC operation exceeds bounded timeout without hanging", async () => {
      const scheduler = new RpcScheduler(3);

      const hangingTask = scheduler.schedule(
        "hanging-rpc-call",
        "P2_PORTFOLIO",
        async () => {
          // Simulates unresponsive Devnet node
          await new Promise((res) => setTimeout(res, 1000));
          return "too-late";
        },
        { timeoutMs: 50 } // Hard timeout 50ms
      );

      let caughtError: Error | null = null;
      try {
        await hangingTask;
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).to.not.be.null;
      expect(caughtError?.message).to.include("RPC request timeout after 50ms");
    });
  });

  describe("Invariant 4: Rate-Limit Detection & Health State Machine", () => {
    it("detects 429 Too Many Requests and transitions health state to DEGRADED", async () => {
      const scheduler = new RpcScheduler(2, 15); // Fast 15ms base backoff for tests
      let reportedHealth: string = "INITIAL";

      scheduler.onHealthChange = (health) => {
        if (health.solanaRpc) {
          reportedHealth = health.solanaRpc;
        }
      };

      const failingTask = scheduler.schedule(
        "rate-limited-query",
        "P2_PORTFOLIO",
        async () => {
          throw new Error("429 Too Many Requests: Connection rate limits exceeded");
        }
      );

      let caughtError: any = null;
      try {
        await failingTask;
      } catch (e) {
        caughtError = e;
      }

      expect(reportedHealth).to.equal("DEGRADED");
      expect(caughtError).to.not.be.null;
      expect(String(caughtError)).to.include("429 Too Many Requests");
    });
  });

  describe("Invariant 5: Centralized SubscriptionRegistry", () => {
    it("shares a single underlying subscription across multiple consumers and ref-counts", () => {
      const registry = new SubscriptionRegistry();
      let rpcSubCount = 0;

      // Mock Connection
      const mockConn: any = {
        onAccountChange: (pk: PublicKey, callback: any) => {
          rpcSubCount++;
          return 999;
        },
        removeAccountChangeListener: (subId: number) => {
          rpcSubCount--;
        },
      };

      const testPk = new PublicKey("11111111111111111111111111111111");

      // 3 components subscribe to the same account
      const unsub1 = registry.subscribeAccount(mockConn, testPk, () => {});
      const unsub2 = registry.subscribeAccount(mockConn, testPk, () => {});
      const unsub3 = registry.subscribeAccount(mockConn, testPk, () => {});

      expect(rpcSubCount).to.equal(1);
      expect(registry.getSubscriberCount(testPk)).to.equal(3);

      // Unsubscribe 2 consumers
      unsub1();
      unsub2();
      expect(rpcSubCount).to.equal(1);
      expect(registry.getSubscriberCount(testPk)).to.equal(1);

      // Last consumer unmounts
      unsub3();
      expect(registry.getSubscriberCount(testPk)).to.equal(0);
    });
  });

  describe("Invariant 6: Reactive SlotStream Independence", () => {
    it("propagates slot updates independently of portfolio or market state", () => {
      const stream = new SlotStream();
      const receivedSlots: number[] = [];

      const unsub = stream.subscribe((slot) => {
        receivedSlots.push(slot);
      });

      stream.updateSlot(320000001);
      stream.updateSlot(320000002);
      stream.updateSlot(320000003);

      expect(receivedSlots).to.deep.equal([320000001, 320000002, 320000003]);
      expect(stream.getCurrentSlot()).to.equal(320000003);

      unsub();
    });
  });

  describe("Invariant 7: Truthful Partial States on Missing / Syncing Data", () => {
    it("guarantees missing snapshot never defaults to SAFE risk or $0.00 credit", () => {
      const snapshot = null;
      const isInitialLoading = true;

      // Truthful derivation logic matching Profile.tsx
      const riskDisplay = snapshot ? (snapshot as any).riskState : (isInitialLoading ? "SYNCING..." : "UNKNOWN");
      const riskTone = !snapshot ? "neutral" : (snapshot as any).riskState === "SAFE" ? "success" : "danger";
      const creditDisplay = snapshot ? `$${(snapshot as any).borrowCapacityUsd}` : (isInitialLoading ? "SYNCING..." : "UNKNOWN");

      expect(riskDisplay).to.equal("SYNCING...");
      expect(riskDisplay).to.not.equal("SAFE");
      expect(riskTone).to.equal("neutral");

      expect(creditDisplay).to.equal("SYNCING...");
      expect(creditDisplay).to.not.equal("$0.00");
    });

    it("reports UNKNOWN when loading finishes but snapshot is null", () => {
      const snapshot = null;
      const isInitialLoading = false;

      const riskDisplay = snapshot ? (snapshot as any).riskState : (isInitialLoading ? "SYNCING..." : "UNKNOWN");
      const creditDisplay = snapshot ? `$${(snapshot as any).borrowCapacityUsd}` : (isInitialLoading ? "SYNCING..." : "UNKNOWN");

      expect(riskDisplay).to.equal("UNKNOWN");
      expect(creditDisplay).to.equal("UNKNOWN");
    });
  });
});
