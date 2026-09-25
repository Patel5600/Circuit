import { orchestrateAgentChat } from '../api/agent/_orchestrator';

async function test() {
  console.log('Testing orchestrateAgentChat...');
  try {
    const res = await orchestrateAgentChat({
      messages: [{ role: 'user', content: 'hello' }],
      snapshot: {
        walletAddress: null,
        controlMode: 'MANUAL',
        hasActiveAuthority: false,
        riskRatchetState: 'SAFE',
        isMarketOpen: true,
        totalCollateralUsd: 0,
        totalDebtUsd: 0,
        availableCreditUsd: 0,
        healthFactor: null,
        positions: [],
        markets: [],
        onChainAuthorities: [],
      }
    });
    console.log('Result response:', res.response);
  } catch (e) {
    console.error('orchestrateAgentChat error:', e);
  }
}
test();
