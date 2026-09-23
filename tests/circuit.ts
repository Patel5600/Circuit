/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/circuit.json`.
 */
export type Circuit = {
  "address": "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2",
  "metadata": {
    "name": "circuit",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Circuit Protocol - Programmable collateral for tokenized equities on Solana"
  },
  "docs": [
    "Circuit Protocol - Programmable collateral for tokenized equities on Solana.",
    "",
    "Combines verifiable market-state gating, oracle-validated credit,",
    "health-factor enforcement, and onchain liquidation.",
    "",
    "See ARCHITECTURE.md and SECURITY.md for full documentation."
  ],
  "instructions": [
    {
      "name": "authorizeAction",
      "docs": [
        "Authorize a scoped action capability and mint a short-lived RiskEnvelope PDA.",
        "Strictly evaluated by the canonical Risk Ratchet, Pyth oracle confidence, and Permission Engine."
      ],
      "discriminator": [
        11,
        87,
        202,
        95,
        221,
        45,
        38,
        210
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Payer who covers rent for the newly initialized RiskEnvelope PDA"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "Position owner delegating or executing"
          ]
        },
        {
          "name": "actor",
          "docs": [
            "Actor requesting authorization (either human owner or delegated agent)"
          ],
          "signer": true
        },
        {
          "name": "protocolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "riskRatchet"
        },
        {
          "name": "position",
          "docs": [
            "Position account (optional/unchecked; validated if initialized)"
          ]
        },
        {
          "name": "agentAuthority",
          "docs": [
            "Agent authority PDA (optional/unchecked; validated if actor != owner)"
          ]
        },
        {
          "name": "envelope",
          "docs": [
            "Dedicated Risk Envelope state PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  118,
                  101,
                  108,
                  111,
                  112,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "actor"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2 oracle account"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "action",
          "type": "u8"
        },
        {
          "name": "venue",
          "type": "u8"
        },
        {
          "name": "requestedAmount",
          "type": "u64"
        },
        {
          "name": "maxSlippageBps",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "ttlSlots",
          "type": "u64"
        }
      ]
    },
    {
      "name": "borrow",
      "docs": [
        "Borrow quote tokens against collateral.",
        "Full oracle + market + health factor validation.",
        "Blocked when paused or market unsafe."
      ],
      "discriminator": [
        228,
        253,
        131,
        202,
        207,
        116,
        89,
        18
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Borrower - must be the position owner"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA - validates mint, feed ID, and risk parameters"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Position PDA - must already exist (created during deposit)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2 account - validated by oracle module"
          ]
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral token mint"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote token mint"
          ]
        },
        {
          "name": "userQuoteAta",
          "docs": [
            "User's quote token account (receives borrowed tokens)"
          ],
          "writable": true
        },
        {
          "name": "treasuryQuoteAta",
          "docs": [
            "Circuit Treasury's quote token account (receives protocol fee)"
          ],
          "writable": true
        },
        {
          "name": "liquidityVault",
          "docs": [
            "Protocol liquidity vault (source of borrowed tokens)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelLiquidationAuction",
      "docs": [
        "Cancel an active auction if the position has returned to healthy territory (Tier 2).",
        "Permissionless. Closes LiquidationAuction PDA and refunds rent."
      ],
      "discriminator": [
        166,
        8,
        159,
        250,
        100,
        241,
        158,
        59
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Any caller can cancel a healed auction"
          ],
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Position PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2"
          ]
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral token mint"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote token mint"
          ]
        },
        {
          "name": "auction",
          "docs": [
            "LiquidationAuction PDA to close"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ]
          }
        },
        {
          "name": "auctionInitiator",
          "docs": [
            "Original initiator of the auction receiving rent refund"
          ],
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "closeEnvelope",
      "docs": [
        "Close an expired or consumed RiskEnvelope account and reclaim rent back to owner.",
        "Permissionless crank."
      ],
      "discriminator": [
        140,
        198,
        50,
        187,
        85,
        89,
        13,
        23
      ],
      "accounts": [
        {
          "name": "closer",
          "docs": [
            "Permissionless closer"
          ],
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "The position owner receiving the rent refund"
          ],
          "writable": true
        },
        {
          "name": "envelope",
          "docs": [
            "The RiskEnvelope account to close"
          ],
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "consumeEnvelope",
      "docs": [
        "Consume an authorized RiskEnvelope capability token.",
        "Strictly verifies actor, non-consumption, expiration, risk epoch, action, venue, and notional limit."
      ],
      "discriminator": [
        178,
        151,
        217,
        31,
        60,
        195,
        207,
        194
      ],
      "accounts": [
        {
          "name": "actor",
          "docs": [
            "The authorized actor executing the operation"
          ],
          "signer": true
        },
        {
          "name": "envelope",
          "docs": [
            "The RiskEnvelope capability token being consumed"
          ],
          "writable": true
        },
        {
          "name": "riskRatchet",
          "docs": [
            "The live RiskRatchet PDA for live risk epoch verification"
          ]
        }
      ],
      "args": [
        {
          "name": "action",
          "type": "u8"
        },
        {
          "name": "venue",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createAgentAuthority",
      "docs": [
        "Delegate bounded execution authority to an autonomous stock strategy.",
        "Owner retains asset ownership; agent receives constrained execution rights."
      ],
      "discriminator": [
        108,
        225,
        37,
        94,
        74,
        112,
        9,
        83
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "agent",
          "docs": [
            "The autonomous agent / strategy being delegated authority"
          ]
        },
        {
          "name": "assetMint",
          "docs": [
            "The tokenized stock collateral mint this authority governs"
          ]
        },
        {
          "name": "agentAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "agent"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "allowedActions",
          "type": "u8"
        },
        {
          "name": "maxBorrowLimit",
          "type": "u64"
        },
        {
          "name": "maxWithdrawLimit",
          "type": "u64"
        },
        {
          "name": "riskBudget",
          "type": "u64"
        },
        {
          "name": "expiryTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "Deposit equity tokens as collateral.",
        "Creates position on first deposit. Allowed when paused."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "User depositing collateral"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig - not strictly needed for deposit but validates",
            "the collateral vault authority"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig - validates the equity mint and enabled status"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "The equity token mint"
          ]
        },
        {
          "name": "position",
          "docs": [
            "User's Position PDA - created on first deposit"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "userCollateralAta",
          "docs": [
            "User's equity token account"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Protocol collateral vault - ATA of protocol PDA for equity mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeAgentAction",
      "docs": [
        "Execute an authorized action proposed by an autonomous strategy.",
        "Strictly gated onchain by Risk Ratchet, Capital Policy, and dynamic risk budget B_t."
      ],
      "discriminator": [
        170,
        161,
        176,
        247,
        194,
        95,
        1,
        81
      ],
      "accounts": [
        {
          "name": "agent",
          "docs": [
            "The autonomous agent signer executing this action"
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "agentAuthority"
          ]
        },
        {
          "name": "owner",
          "docs": [
            "The position owner who delegated authority"
          ],
          "relations": [
            "agentAuthority"
          ]
        },
        {
          "name": "protocolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "riskRatchet",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "agentAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "agent"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "docs": [
            "Protocol collateral vault ATA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "liquidityVault",
          "docs": [
            "Protocol liquidity vault ATA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "userCollateralAta",
          "docs": [
            "User / agent token account for collateral"
          ],
          "writable": true
        },
        {
          "name": "userQuoteAta",
          "docs": [
            "User / agent token account for quote currency"
          ],
          "writable": true
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2 account"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "action",
          "type": {
            "defined": {
              "name": "agentAction"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "intentNonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeDbcAction",
      "docs": [
        "Execute or authorize a liquidity/swap action on Meteora Dynamic Bonding Curve (DBC).",
        "Bound to verified AssetRegistryEntry, Pyth oracle confidence, and Section 15 Risk Matrix."
      ],
      "discriminator": [
        7,
        170,
        72,
        117,
        127,
        108,
        26,
        212
      ],
      "accounts": [
        {
          "name": "actor",
          "docs": [
            "The executing signer (either human owner or delegated agent)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "docs": [
            "The capital owner delegating authority"
          ]
        },
        {
          "name": "protocolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "riskRatchet",
          "writable": true
        },
        {
          "name": "assetRegistry",
          "docs": [
            "Authoritative on-chain registry entry binding asset to its Meteora DBC pool"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "agentAuthority",
          "docs": [
            "Optional AgentAuthority PDA (required when actor != owner)"
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "actor"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "dbcPool",
          "docs": [
            "Verified Meteora Dynamic Bonding Curve pool account"
          ],
          "writable": true
        },
        {
          "name": "dbcProgram",
          "docs": [
            "Meteora Dynamic Bonding Curve Program ID"
          ]
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2 oracle account"
          ]
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "userSourceAta",
          "docs": [
            "User's source token account (input to DBC)"
          ],
          "writable": true
        },
        {
          "name": "userDestinationAta",
          "docs": [
            "User's destination token account (output from DBC)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "actionType",
          "type": "u8"
        },
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minAmountOut",
          "type": "u64"
        },
        {
          "name": "intentNonce",
          "type": "u64"
        },
        {
          "name": "dbcInstructionData",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "initializeProtocol",
      "docs": [
        "Initialize the global protocol configuration.",
        "Can only be called once (PDA prevents re-init)."
      ],
      "discriminator": [
        188,
        233,
        252,
        106,
        134,
        146,
        202,
        91
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Admin authority - becomes the protocol authority"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA - singleton, seeds = [\"protocol\"]"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "minHealthFactorBps",
          "type": "u64"
        },
        {
          "name": "defaultMaxOracleAge",
          "type": "u64"
        },
        {
          "name": "defaultMaxConfBps",
          "type": "u64"
        },
        {
          "name": "liquidationBonusBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "liquidate",
      "docs": [
        "Liquidate an unhealthy position (full liquidation, MVP).",
        "Uses emergency price policy when current oracle is invalid.",
        "Permissionless. Allowed when paused."
      ],
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "docs": [
            "Liquidator - any account can liquidate"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "The position being liquidated - NOT owned by the liquidator"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2 - used if valid, otherwise falls back to last_valid_price"
          ]
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral token mint"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote token mint"
          ]
        },
        {
          "name": "liquidatorQuoteAta",
          "docs": [
            "Liquidator's quote token account (pays debt)"
          ],
          "writable": true
        },
        {
          "name": "liquidatorCollateralAta",
          "docs": [
            "Liquidator's collateral token account (receives seized collateral)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Protocol collateral vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "liquidityVault",
          "docs": [
            "Protocol liquidity vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "liquidateAuction",
      "docs": [
        "Liquidate an active Dutch auction position with partial close factor (Tier 2).",
        "Discount scales smoothly with elapsed slots; repays up to 50% of debt."
      ],
      "discriminator": [
        9,
        36,
        3,
        0,
        175,
        57,
        160,
        26
      ],
      "accounts": [
        {
          "name": "liquidator",
          "docs": [
            "Liquidator paying debt and receiving discounted collateral"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Position PDA being liquidated"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "auction",
          "docs": [
            "LiquidationAuction PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ]
          }
        },
        {
          "name": "auctionInitiator",
          "docs": [
            "Original initiator of the auction receiving rent refund if auction completes"
          ],
          "writable": true
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2"
          ]
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral token mint"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote token mint"
          ]
        },
        {
          "name": "liquidatorQuoteAta",
          "docs": [
            "Liquidator's quote token account (pays debt)"
          ],
          "writable": true
        },
        {
          "name": "liquidatorCollateralAta",
          "docs": [
            "Liquidator's collateral token account (receives seized collateral)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Protocol collateral vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "liquidityVault",
          "docs": [
            "Protocol liquidity vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "requestedRepay",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pauseProtocol",
      "docs": [
        "Pause the protocol (borrow/withdraw blocked)."
      ],
      "discriminator": [
        144,
        95,
        0,
        107,
        119,
        39,
        248,
        141
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Admin authority"
          ],
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "refreshGuard",
      "docs": [
        "Refresh the cached MarketGuard state.",
        "Permissionless. Does NOT serve as sole authorization for borrow/withdraw."
      ],
      "discriminator": [
        49,
        50,
        69,
        203,
        152,
        103,
        48,
        56
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone can call refresh_guard - permissionless"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA - source of oracle config and custody/liquidity state"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "marketGuard",
          "docs": [
            "MarketGuard PDA to update"
          ],
          "writable": true
        },
        {
          "name": "riskRatchet",
          "docs": [
            "Dedicated RiskRatchet PDA - one per Pyth feed.",
            "Uses init_if_needed for zero-friction lazy activation across all 12 devnet markets."
          ],
          "writable": true
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2 account"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "registerAsset",
      "docs": [
        "Register a new equity token as collateral.",
        "Creates AssetConfig, MarketGuard, and vault accounts."
      ],
      "discriminator": [
        21,
        80,
        155,
        149,
        117,
        207,
        235,
        16
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Admin authority - must match ProtocolConfig.authority"
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "protocolConfig"
          ]
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig - validates admin authority"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "The equity token mint being registered as collateral"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "The quote token mint (e.g., TEST-USDC) for borrowing"
          ]
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA - seeds: [\"asset\", mint]"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "marketGuard",
          "docs": [
            "MarketGuard PDA - seeds: [\"guard\", pyth_feed_id]"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "pythFeedId"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "docs": [
            "Collateral vault - ATA of protocol PDA for equity mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "liquidityVault",
          "docs": [
            "Liquidity vault - ATA of protocol PDA for quote mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "pythFeedId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "baseLtvBps",
          "type": "u64"
        },
        {
          "name": "liquidationThresholdBps",
          "type": "u64"
        },
        {
          "name": "liquidationBonusBps",
          "type": "u64"
        },
        {
          "name": "maxOracleAge",
          "type": "u64"
        },
        {
          "name": "maxConfBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "repay",
      "docs": [
        "Repay outstanding debt.",
        "Always allowed (even when paused)."
      ],
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "User repaying debt"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig - needed for vault authority validation"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig - validates the asset"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Position PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote token mint"
          ]
        },
        {
          "name": "userQuoteAta",
          "docs": [
            "User's quote token account (source of repayment)"
          ],
          "writable": true
        },
        {
          "name": "liquidityVault",
          "docs": [
            "Protocol liquidity vault (receives repayment)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setCustodyState",
      "docs": [
        "Set custody state (admin-controlled MVP simulation input)."
      ],
      "discriminator": [
        110,
        60,
        239,
        56,
        209,
        15,
        158,
        179
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Admin authority"
          ],
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig - validates admin"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig to update"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newState",
          "type": {
            "defined": {
              "name": "custodyState"
            }
          }
        }
      ]
    },
    {
      "name": "setLiquidityState",
      "docs": [
        "Set liquidity state (admin-controlled MVP simulation input)."
      ],
      "discriminator": [
        45,
        54,
        30,
        2,
        46,
        66,
        83,
        215
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Admin authority"
          ],
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig - validates admin"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig to update"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newState",
          "type": {
            "defined": {
              "name": "liquidityState"
            }
          }
        }
      ]
    },
    {
      "name": "startLiquidationAuction",
      "docs": [
        "Initiate a continuous time-ramped Dutch auction for an unhealthy position (Tier 2).",
        "Permissionless crank. Creates the LiquidationAuction PDA."
      ],
      "discriminator": [
        32,
        210,
        115,
        53,
        58,
        3,
        225,
        120
      ],
      "accounts": [
        {
          "name": "initiator",
          "docs": [
            "Initiator/crank paying rent for the LiquidationAuction account"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "The unhealthy position entering auction"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2"
          ]
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral token mint"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote token mint"
          ]
        },
        {
          "name": "auction",
          "docs": [
            "LiquidationAuction PDA being initialized"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "unpauseProtocol",
      "docs": [
        "Unpause the protocol."
      ],
      "discriminator": [
        183,
        154,
        5,
        183,
        105,
        76,
        87,
        18
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Admin authority"
          ],
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateAgentAuthority",
      "docs": [
        "Update delegated agent authority policy parameters or revoke permissions (owner-only)."
      ],
      "discriminator": [
        168,
        204,
        173,
        196,
        82,
        181,
        85,
        44
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Only the delegating owner can update authority parameters"
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "agentAuthority"
          ]
        },
        {
          "name": "agent",
          "docs": [
            "The agent whose authority is being modified"
          ],
          "relations": [
            "agentAuthority"
          ]
        },
        {
          "name": "assetMint",
          "docs": [
            "The tokenized stock collateral mint"
          ],
          "relations": [
            "agentAuthority"
          ]
        },
        {
          "name": "agentAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "agent"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "allowedActions",
          "type": "u8"
        },
        {
          "name": "maxBorrowLimit",
          "type": "u64"
        },
        {
          "name": "maxWithdrawLimit",
          "type": "u64"
        },
        {
          "name": "riskBudget",
          "type": "u64"
        },
        {
          "name": "expiryTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "updateFeeConfig",
      "docs": [
        "Update protocol fee configuration (admin-only)."
      ],
      "discriminator": [
        104,
        184,
        103,
        242,
        88,
        151,
        107,
        20
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Protocol admin authority"
          ],
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig singleton PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "feeRecipient",
          "type": "pubkey"
        },
        {
          "name": "borrowFeeBps",
          "type": "u64"
        },
        {
          "name": "feeEnabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Withdraw collateral.",
        "Risk-increasing - requires oracle + health factor validation when debt > 0.",
        "Blocked when paused."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "User withdrawing collateral"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "docs": [
            "ProtocolConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "assetConfig",
          "docs": [
            "AssetConfig PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Position PDA"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "assetConfig.mint",
                "account": "assetConfig"
              }
            ]
          }
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth PriceUpdateV2 - required when debt > 0",
            "When debt == 0, this account is still required to be provided",
            "but is not read (Anchor requires all accounts to be present)."
          ]
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral token mint"
          ]
        },
        {
          "name": "quoteMint",
          "docs": [
            "Quote token mint"
          ]
        },
        {
          "name": "userCollateralAta",
          "docs": [
            "User's collateral token account (receives withdrawn tokens)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Protocol collateral vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "protocolConfig"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentAuthority",
      "discriminator": [
        161,
        225,
        83,
        39,
        179,
        98,
        31,
        118
      ]
    },
    {
      "name": "assetConfig",
      "discriminator": [
        57,
        112,
        247,
        166,
        247,
        64,
        140,
        23
      ]
    },
    {
      "name": "assetRegistryEntry",
      "discriminator": [
        234,
        239,
        108,
        165,
        185,
        162,
        7,
        84
      ]
    },
    {
      "name": "liquidationAuction",
      "discriminator": [
        114,
        80,
        77,
        48,
        79,
        174,
        24,
        141
      ]
    },
    {
      "name": "marketGuard",
      "discriminator": [
        173,
        46,
        45,
        195,
        31,
        243,
        55,
        153
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "protocolConfig",
      "discriminator": [
        207,
        91,
        250,
        28,
        152,
        179,
        215,
        209
      ]
    },
    {
      "name": "riskEnvelope",
      "discriminator": [
        51,
        97,
        24,
        200,
        134,
        168,
        42,
        85
      ]
    },
    {
      "name": "riskRatchet",
      "discriminator": [
        26,
        13,
        25,
        173,
        219,
        247,
        249,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "actionAllowed",
      "discriminator": [
        198,
        68,
        102,
        235,
        199,
        134,
        18,
        102
      ]
    },
    {
      "name": "actionDenied",
      "discriminator": [
        243,
        239,
        240,
        51,
        151,
        100,
        10,
        100
      ]
    },
    {
      "name": "agentAuthorityCreated",
      "discriminator": [
        56,
        134,
        66,
        40,
        73,
        49,
        228,
        39
      ]
    },
    {
      "name": "agentAuthorityRevoked",
      "discriminator": [
        17,
        248,
        160,
        61,
        125,
        212,
        121,
        97
      ]
    },
    {
      "name": "agentAuthorityUpdated",
      "discriminator": [
        32,
        13,
        92,
        242,
        7,
        75,
        95,
        145
      ]
    },
    {
      "name": "auctionCreated",
      "discriminator": [
        133,
        190,
        194,
        65,
        172,
        0,
        70,
        178
      ]
    },
    {
      "name": "auctionSettled",
      "discriminator": [
        61,
        151,
        131,
        170,
        95,
        203,
        219,
        147
      ]
    },
    {
      "name": "borrowAllowed",
      "discriminator": [
        37,
        163,
        135,
        41,
        32,
        20,
        148,
        72
      ]
    },
    {
      "name": "borrowBlocked",
      "discriminator": [
        21,
        47,
        47,
        161,
        15,
        161,
        181,
        62
      ]
    },
    {
      "name": "borrowEvent",
      "discriminator": [
        86,
        8,
        140,
        206,
        215,
        179,
        118,
        201
      ]
    },
    {
      "name": "borrowExecuted",
      "discriminator": [
        237,
        179,
        78,
        128,
        82,
        9,
        45,
        124
      ]
    },
    {
      "name": "capitalPolicyUpdated",
      "discriminator": [
        179,
        140,
        25,
        201,
        168,
        138,
        161,
        43
      ]
    },
    {
      "name": "dbcActionDenied",
      "discriminator": [
        183,
        46,
        20,
        120,
        177,
        126,
        167,
        50
      ]
    },
    {
      "name": "dbcActionExecuted",
      "discriminator": [
        173,
        172,
        153,
        137,
        201,
        106,
        75,
        117
      ]
    },
    {
      "name": "depositEvent",
      "discriminator": [
        120,
        248,
        61,
        83,
        31,
        142,
        107,
        144
      ]
    },
    {
      "name": "envelopeAuthorizationDenied",
      "discriminator": [
        242,
        196,
        107,
        12,
        162,
        34,
        159,
        192
      ]
    },
    {
      "name": "envelopeAuthorized",
      "discriminator": [
        12,
        226,
        246,
        18,
        1,
        80,
        134,
        111
      ]
    },
    {
      "name": "envelopeClosed",
      "discriminator": [
        49,
        45,
        231,
        243,
        152,
        42,
        107,
        237
      ]
    },
    {
      "name": "envelopeConsumed",
      "discriminator": [
        245,
        187,
        251,
        87,
        62,
        32,
        200,
        5
      ]
    },
    {
      "name": "liquidateEvent",
      "discriminator": [
        158,
        94,
        144,
        4,
        147,
        52,
        5,
        255
      ]
    },
    {
      "name": "protocolFeeCollected",
      "discriminator": [
        149,
        0,
        167,
        154,
        105,
        146,
        209,
        134
      ]
    },
    {
      "name": "recoveryObserved",
      "discriminator": [
        34,
        164,
        108,
        143,
        250,
        163,
        48,
        218
      ]
    },
    {
      "name": "repayEvent",
      "discriminator": [
        129,
        213,
        0,
        108,
        218,
        108,
        82,
        140
      ]
    },
    {
      "name": "riskBudgetChanged",
      "discriminator": [
        26,
        145,
        112,
        132,
        86,
        212,
        105,
        232
      ]
    },
    {
      "name": "riskStateChanged",
      "discriminator": [
        195,
        213,
        216,
        46,
        19,
        110,
        85,
        196
      ]
    },
    {
      "name": "withdrawEvent",
      "discriminator": [
        22,
        9,
        133,
        26,
        160,
        44,
        71,
        192
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "protocolPaused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6001,
      "name": "assetDisabled",
      "msg": "Asset is disabled"
    },
    {
      "code": 6002,
      "name": "invalidAsset",
      "msg": "Invalid asset configuration"
    },
    {
      "code": 6003,
      "name": "invalidOracle",
      "msg": "Invalid oracle account"
    },
    {
      "code": 6004,
      "name": "invalidFeed",
      "msg": "Oracle feed ID mismatch"
    },
    {
      "code": 6005,
      "name": "staleOracle",
      "msg": "Oracle price is stale"
    },
    {
      "code": 6006,
      "name": "confidenceTooWide",
      "msg": "Oracle confidence interval too wide"
    },
    {
      "code": 6007,
      "name": "marketClosed",
      "msg": "Reference market is closed"
    },
    {
      "code": 6008,
      "name": "marketRestricted",
      "msg": "Market state is restricted"
    },
    {
      "code": 6009,
      "name": "marketEmergency",
      "msg": "Market state is emergency"
    },
    {
      "code": 6010,
      "name": "insufficientCollateral",
      "msg": "Insufficient collateral"
    },
    {
      "code": 6011,
      "name": "borrowExceedsCapacity",
      "msg": "Borrow exceeds capacity"
    },
    {
      "code": 6012,
      "name": "healthFactorTooLow",
      "msg": "Health factor too low"
    },
    {
      "code": 6013,
      "name": "notLiquidatable",
      "msg": "Position is not liquidatable"
    },
    {
      "code": 6014,
      "name": "invalidPositionOwner",
      "msg": "Invalid position owner"
    },
    {
      "code": 6015,
      "name": "invalidCustodyState",
      "msg": "Invalid custody state"
    },
    {
      "code": 6016,
      "name": "invalidLiquidityState",
      "msg": "Invalid liquidity state"
    },
    {
      "code": 6017,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6018,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6019,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account"
    },
    {
      "code": 6020,
      "name": "unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6021,
      "name": "invalidPda",
      "msg": "Invalid PDA"
    },
    {
      "code": 6022,
      "name": "invalidTimestamp",
      "msg": "Invalid timestamp"
    },
    {
      "code": 6023,
      "name": "invalidPrice",
      "msg": "Invalid price"
    },
    {
      "code": 6024,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity"
    },
    {
      "code": 6025,
      "name": "repayExceedsDebt",
      "msg": "Repay exceeds debt"
    },
    {
      "code": 6026,
      "name": "withdrawExceedsCollateral",
      "msg": "Withdraw exceeds collateral"
    },
    {
      "code": 6027,
      "name": "auctionAlreadyActive",
      "msg": "Liquidation auction already active"
    },
    {
      "code": 6028,
      "name": "auctionNotActive",
      "msg": "Liquidation auction not active"
    },
    {
      "code": 6029,
      "name": "auctionStillActive",
      "msg": "Position is still unhealthy, cannot cancel auction"
    },
    {
      "code": 6030,
      "name": "riskRestricted",
      "msg": "Operation rejected: Risk Ratchet is in Restricted state"
    },
    {
      "code": 6031,
      "name": "riskDefensive",
      "msg": "Operation rejected: Risk Ratchet is in Defensive state"
    },
    {
      "code": 6032,
      "name": "riskEmergency",
      "msg": "Operation rejected: Risk Ratchet is in Emergency state"
    },
    {
      "code": 6033,
      "name": "withdrawRestrictedInStress",
      "msg": "Collateral withdrawal with active debt is prohibited during defensive or emergency risk states"
    },
    {
      "code": 6034,
      "name": "invalidConfidenceInterval",
      "msg": "Oracle confidence interval is invalid or exceeds allowable threshold"
    },
    {
      "code": 6035,
      "name": "illegalStateTransition",
      "msg": "Illegal risk ratchet recovery transition attempted"
    },
    {
      "code": 6036,
      "name": "invalidFeeRecipient",
      "msg": "Fee recipient account does not match configured protocol treasury"
    },
    {
      "code": 6037,
      "name": "feeBpsExceedsMaximum",
      "msg": "Borrow fee BPS exceeds maximum allowable limit"
    },
    {
      "code": 6038,
      "name": "invalidFeeAccount",
      "msg": "Invalid protocol fee token account"
    },
    {
      "code": 6039,
      "name": "insufficientLiquidationAmount",
      "msg": "Liquidation repayment amount is insufficient to restore target health factor"
    },
    {
      "code": 6040,
      "name": "capitalPolicyBlocked",
      "msg": "Operation rejected by authoritative Capital Policy"
    },
    {
      "code": 6041,
      "name": "borrowDisabledByRiskPolicy",
      "msg": "Borrowing is disabled by current on-chain capital policy"
    },
    {
      "code": 6042,
      "name": "withdrawDisabledByRiskPolicy",
      "msg": "Withdrawal is disabled by current on-chain capital policy"
    },
    {
      "code": 6043,
      "name": "effectiveLtvExceeded",
      "msg": "Proposed operation exceeds effective LTV capacity"
    },
    {
      "code": 6044,
      "name": "invalidRiskTransition",
      "msg": "Attempted an invalid risk state transition"
    },
    {
      "code": 6045,
      "name": "riskEpochMismatch",
      "msg": "Risk epoch mismatch"
    },
    {
      "code": 6046,
      "name": "oracleConditionUnsafe",
      "msg": "Oracle condition is unsafe"
    },
    {
      "code": 6047,
      "name": "positionWouldBecomeUnsafe",
      "msg": "Resulting position would become unsafe"
    },
    {
      "code": 6048,
      "name": "auctionExpired",
      "msg": "Liquidation auction has expired"
    },
    {
      "code": 6049,
      "name": "auctionPriceOutOfBounds",
      "msg": "Calculated auction price is out of bounds"
    },
    {
      "code": 6050,
      "name": "agentAuthorityExpired",
      "msg": "Agent authority has expired"
    },
    {
      "code": 6051,
      "name": "agentActionNotPermitted",
      "msg": "Agent is not authorized to execute this action"
    },
    {
      "code": 6052,
      "name": "agentBorrowLimitExceeded",
      "msg": "Requested borrow exceeds agent authority policy limit"
    },
    {
      "code": 6053,
      "name": "agentWithdrawLimitExceeded",
      "msg": "Requested withdrawal exceeds agent authority policy limit"
    },
    {
      "code": 6054,
      "name": "insufficientRiskBudget",
      "msg": "Action risk cost exceeds agent remaining risk budget"
    },
    {
      "code": 6055,
      "name": "agentAuthorityUnauthorized",
      "msg": "Signer does not match delegated agent authority"
    },
    {
      "code": 6056,
      "name": "invalidAgentOwner",
      "msg": "Agent authority owner does not match position owner"
    },
    {
      "code": 6057,
      "name": "actionNonceInvalid",
      "msg": "Action intent nonce mismatch or replay detected"
    },
    {
      "code": 6058,
      "name": "riskDataStale",
      "msg": "Risk observation data is stale"
    },
    {
      "code": 6059,
      "name": "riskDataInvalid",
      "msg": "Risk calculation data is invalid"
    },
    {
      "code": 6060,
      "name": "oracleConfidenceTooWide",
      "msg": "Oracle confidence interval is too wide for credit operations"
    },
    {
      "code": 6061,
      "name": "riskStateTransitionDenied",
      "msg": "Risk state transition was denied by state machine rules"
    },
    {
      "code": 6062,
      "name": "cooldownActive",
      "msg": "Transition rejected: cooldown duration is currently active"
    },
    {
      "code": 6063,
      "name": "recoveryConditionsNotMet",
      "msg": "Staged recovery conditions have not been satisfied"
    },
    {
      "code": 6064,
      "name": "actionBlockedByRisk",
      "msg": "Action blocked by on-chain risk policy"
    },
    {
      "code": 6065,
      "name": "actionLimitExceeded",
      "msg": "Action amount exceeds allowable limit"
    },
    {
      "code": 6066,
      "name": "assetScopeViolation",
      "msg": "Asset mint is outside authorized scope"
    },
    {
      "code": 6067,
      "name": "policyVersionMismatch",
      "msg": "Policy version mismatch"
    },
    {
      "code": 6068,
      "name": "invalidDbcPool",
      "msg": "DBC pool address does not match asset registry"
    },
    {
      "code": 6069,
      "name": "dbcSlippageExceeded",
      "msg": "DBC swap slippage exceeded: minimum amount out not met"
    },
    {
      "code": 6070,
      "name": "dbcActionBlocked",
      "msg": "DBC action blocked by risk policy"
    },
    {
      "code": 6071,
      "name": "envelopeExpired",
      "msg": "Risk envelope has expired"
    },
    {
      "code": 6072,
      "name": "envelopeAlreadyConsumed",
      "msg": "Risk envelope has already been consumed"
    },
    {
      "code": 6073,
      "name": "envelopeEpochMismatch",
      "msg": "Risk epoch has changed since envelope was authorized"
    },
    {
      "code": 6074,
      "name": "envelopeActionMismatch",
      "msg": "Envelope action does not match requested operation"
    },
    {
      "code": 6075,
      "name": "envelopeVenueMismatch",
      "msg": "Envelope venue does not match requested venue"
    },
    {
      "code": 6076,
      "name": "envelopeAmountExceeded",
      "msg": "Requested amount exceeds envelope authorization"
    },
    {
      "code": 6077,
      "name": "envelopeTtlExceeded",
      "msg": "Requested TTL exceeds maximum allowed"
    },
    {
      "code": 6078,
      "name": "envelopeStillActive",
      "msg": "Envelope is still active and cannot be closed"
    },
    {
      "code": 6079,
      "name": "invalidEnvelopeActor",
      "msg": "Signer does not match envelope authorized actor"
    }
  ],
  "types": [
    {
      "name": "actionAllowed",
      "docs": [
        "Emitted when an action passes protocol permission evaluation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "agentAction"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "riskCost",
            "type": "u64"
          },
          {
            "name": "remainingBudget",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "actionDenied",
      "docs": [
        "Emitted when an action is rejected by protocol permission evaluation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "agentAction"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "denialReason",
            "type": {
              "defined": {
                "name": "permissionDenialReason"
              }
            }
          },
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "agentAction",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "deposit"
          },
          {
            "name": "borrow"
          },
          {
            "name": "repay"
          },
          {
            "name": "withdraw"
          }
        ]
      }
    },
    {
      "name": "agentAuthority",
      "docs": [
        "On-chain state account representing bounded authority delegated to an autonomous strategy.",
        "",
        "Seeds: [b\"authority\", owner.as_ref(), agent.as_ref(), asset_mint.as_ref()]",
        "",
        "CRITICAL ARCHITECTURAL PRINCIPLE:",
        "\"The agent does NOT own the user's assets. The agent receives bounded authority",
        "to request and execute actions. Circuit decides what capital they are allowed to risk.\""
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "The user / account owner delegating authority"
            ],
            "type": "pubkey"
          },
          {
            "name": "agent",
            "docs": [
              "The autonomous agent / strategy authorized to execute actions"
            ],
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "docs": [
              "Canonical tokenized stock mint this authority applies to (AAPL, NVDA, etc.)"
            ],
            "type": "pubkey"
          },
          {
            "name": "allowedActions",
            "docs": [
              "Allowed actions bitmask (DEPOSIT=1, BORROW=2, REPAY=4, WITHDRAW=8, SWAP=16, ENTER_LIQUIDITY=32, EXIT_LIQUIDITY=64, REBALANCE=128)"
            ],
            "type": "u8"
          },
          {
            "name": "maxBorrowLimit",
            "docs": [
              "Maximum cumulative borrow limit permitted to this agent"
            ],
            "type": "u64"
          },
          {
            "name": "maxWithdrawLimit",
            "docs": [
              "Maximum cumulative withdrawal limit permitted to this agent"
            ],
            "type": "u64"
          },
          {
            "name": "currentBorrowed",
            "docs": [
              "Cumulative debt borrowed by this agent against the position"
            ],
            "type": "u64"
          },
          {
            "name": "riskBudget",
            "docs": [
              "Remaining dynamic risk budget (B_t) for risk-increasing actions"
            ],
            "type": "u64"
          },
          {
            "name": "initialRiskBudget",
            "docs": [
              "Initial risk budget allocated by owner"
            ],
            "type": "u64"
          },
          {
            "name": "expiryTs",
            "docs": [
              "Unix timestamp after which authority is strictly invalid (0 = perpetual until revoked)"
            ],
            "type": "i64"
          },
          {
            "name": "nonce",
            "docs": [
              "Monotonically increasing nonce tracking action intents executed by this agent"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "agentAuthorityCreated",
      "docs": [
        "Emitted when bounded authority is delegated to an autonomous agent."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "allowedActions",
            "type": "u8"
          },
          {
            "name": "maxBorrowLimit",
            "type": "u64"
          },
          {
            "name": "maxWithdrawLimit",
            "type": "u64"
          },
          {
            "name": "riskBudget",
            "type": "u64"
          },
          {
            "name": "expiryTs",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "agentAuthorityRevoked",
      "docs": [
        "Emitted when delegated agent authority is revoked."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "agentAuthorityUpdated",
      "docs": [
        "Emitted when delegated agent authority parameters are modified by the owner."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "allowedActions",
            "type": "u8"
          },
          {
            "name": "maxBorrowLimit",
            "type": "u64"
          },
          {
            "name": "maxWithdrawLimit",
            "type": "u64"
          },
          {
            "name": "riskBudget",
            "type": "u64"
          },
          {
            "name": "expiryTs",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "assetConfig",
      "docs": [
        "Per-asset configuration - one PDA per supported token mint.",
        "",
        "Seeds: [\"asset\", mint.key()]",
        "",
        "Stores oracle feed binding, risk parameters, and admin-controlled",
        "custody/liquidity simulation state."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Admin authority for this asset's configuration"
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "The SPL token mint this configuration governs (equity token)"
            ],
            "type": "pubkey"
          },
          {
            "name": "pythFeedId",
            "docs": [
              "Pyth price feed identifier (32 bytes).",
              "The on-chain program validates that any PriceUpdateV2 account",
              "matches this exact feed ID before accepting the price."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "baseLtvBps",
            "docs": [
              "Base loan-to-value ratio in BPS (e.g., 7000 = 70%).",
              "Applied only when MarketState == Safe.",
              "MVP: fixed, no dynamic adjustment."
            ],
            "type": "u64"
          },
          {
            "name": "liquidationThresholdBps",
            "docs": [
              "Liquidation threshold in BPS (e.g., 8000 = 80%).",
              "When collateral_value * threshold < debt, position is liquidatable."
            ],
            "type": "u64"
          },
          {
            "name": "liquidationBonusBps",
            "docs": [
              "Per-asset liquidation bonus in BPS (e.g., 500 = 5%).",
              "Overrides global if non-zero; falls back to ProtocolConfig otherwise."
            ],
            "type": "u64"
          },
          {
            "name": "maxOracleAge",
            "docs": [
              "Maximum oracle age in seconds for this specific asset.",
              "Overrides ProtocolConfig.default_max_oracle_age."
            ],
            "type": "u64"
          },
          {
            "name": "maxConfBps",
            "docs": [
              "Maximum confidence width in BPS for this specific asset.",
              "conf * BPS_SCALE / price must be <= this value."
            ],
            "type": "u64"
          },
          {
            "name": "custodyState",
            "docs": [
              "Admin-controlled custody simulation state.",
              "MVP: explicitly set by admin, NOT from a live oracle.",
              "Impaired custody triggers Emergency market state."
            ],
            "type": {
              "defined": {
                "name": "custodyState"
              }
            }
          },
          {
            "name": "liquidityState",
            "docs": [
              "Admin-controlled liquidity simulation state.",
              "MVP: explicitly set by admin, NOT from a live oracle.",
              "Critical/Thin liquidity triggers Emergency/Restricted market state."
            ],
            "type": {
              "defined": {
                "name": "liquidityState"
              }
            }
          },
          {
            "name": "enabled",
            "docs": [
              "Whether this asset is enabled for protocol operations.",
              "Disabled assets block deposit/borrow but allow repay/withdraw."
            ],
            "type": "bool"
          },
          {
            "name": "quoteMint",
            "docs": [
              "The quote token mint (e.g., USDC) used for borrowing against this asset"
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "assetRegistryEntry",
      "docs": [
        "Authoritative on-chain registry entry binding a tokenized stock collateral asset",
        "to its Pyth price feed, quote mint, and verified Meteora Dynamic Bonding Curve (DBC) pool.",
        "",
        "Seeds: [b\"registry\", mint.as_ref()]",
        "",
        "CRITICAL SECURITY INVARIANT (Section 18 & 19):",
        "\"Before interacting with a DBC pool verify: expected pool account, expected base mint,",
        "expected quote mint, expected DBC program, pool status, migration status, asset registry mapping.",
        "Never trust: pool symbol, pool name, frontend label, or user-supplied metadata as authorization.\""
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "Canonical tokenized stock mint (e.g. NVDA, AAPL)"
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "docs": [
              "Canonical quote mint (e.g. USDC)"
            ],
            "type": "pubkey"
          },
          {
            "name": "oracleFeed",
            "docs": [
              "Bound Pyth price feed ID (32 bytes)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "dbcPool",
            "docs": [
              "Bound verified Meteora Dynamic Bonding Curve (DBC) pool PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "marketStatus",
            "docs": [
              "Market status: 0 = Active, 1 = Suspended, 2 = Migrated"
            ],
            "type": "u8"
          },
          {
            "name": "policyVersion",
            "docs": [
              "Policy version"
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "auctionCreated",
      "docs": [
        "Emitted when a recovery Dutch auction is initiated."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "referencePrice",
            "type": "i64"
          },
          {
            "name": "startPrice",
            "type": "i64"
          },
          {
            "name": "floorPrice",
            "type": "i64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          }
        ]
      }
    },
    {
      "name": "auctionSettled",
      "docs": [
        "Emitted when a recovery Dutch auction is settled atomically."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "settlementPrice",
            "type": "i64"
          },
          {
            "name": "debtRepaid",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "auctionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "settled"
          },
          {
            "name": "expired"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "borrowAllowed",
      "docs": [
        "Emitted when a borrow operation is evaluated and authorized by capital policy."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "resultingLtv",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          }
        ]
      }
    },
    {
      "name": "borrowBlocked",
      "docs": [
        "Emitted when a borrow operation is blocked by on-chain capital policy."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "requestedAmount",
            "type": "u64"
          },
          {
            "name": "currentLtv",
            "type": "u64"
          },
          {
            "name": "effectiveLtv",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "reason",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "borrowEvent",
      "docs": [
        "Emitted when a user borrows quote currency against deposited collateral."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "newDebt",
            "type": "u64"
          },
          {
            "name": "healthFactorBps",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "borrowExecuted",
      "docs": [
        "Emitted upon successful execution of an authorized borrow with risk metrics."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "collateralValue",
            "type": "u64"
          },
          {
            "name": "borrowAmount",
            "type": "u64"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          },
          {
            "name": "resultingLtvBps",
            "type": "u64"
          },
          {
            "name": "resultingHealthFactorBps",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "capitalPolicyUpdated",
      "docs": [
        "Emitted when capital policy permissions or effective LTV are updated."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "effectiveLtv",
            "type": "u64"
          },
          {
            "name": "borrowAllowed",
            "type": "bool"
          },
          {
            "name": "withdrawAllowed",
            "type": "bool"
          },
          {
            "name": "repayAllowed",
            "type": "bool"
          },
          {
            "name": "depositAllowed",
            "type": "bool"
          },
          {
            "name": "liquidationAllowed",
            "type": "bool"
          },
          {
            "name": "riskEpoch",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "custodyState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "healthy"
          },
          {
            "name": "delayed"
          },
          {
            "name": "impaired"
          }
        ]
      }
    },
    {
      "name": "dbcActionDenied",
      "docs": [
        "Emitted when a Meteora DBC operation is denied by Circuit Permission Engine."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "actor",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "dbcPool",
            "type": "pubkey"
          },
          {
            "name": "actionType",
            "type": "u8"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "denialReason",
            "type": {
              "defined": {
                "name": "permissionDenialReason"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "dbcActionExecuted",
      "docs": [
        "Emitted upon verified on-chain execution of a Meteora DBC operation through Circuit."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "actor",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "dbcPool",
            "type": "pubkey"
          },
          {
            "name": "actionType",
            "type": "u8"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "minAmountOut",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "riskCost",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "depositEvent",
      "docs": [
        "Emitted when a user deposits tokenized equities into collateral vault."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalCollateral",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "envelopeAuthorizationDenied",
      "docs": [
        "Emitted when an authorization request for a RiskEnvelope is denied by the Risk Kernel."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "actor",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": "u8"
          },
          {
            "name": "venue",
            "type": "u8"
          },
          {
            "name": "requestedAmount",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "denialReason",
            "type": {
              "defined": {
                "name": "permissionDenialReason"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "envelopeAuthorized",
      "docs": [
        "Emitted when a RiskEnvelope capability token is authorized and minted on-chain."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "envelope",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "actor",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "venue",
            "type": "u8"
          },
          {
            "name": "action",
            "type": "u8"
          },
          {
            "name": "maxNotional",
            "type": "u64"
          },
          {
            "name": "maxLtvBps",
            "type": "u64"
          },
          {
            "name": "maxSlippageBps",
            "type": "u64"
          },
          {
            "name": "riskState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "riskEpoch",
            "type": "u64"
          },
          {
            "name": "authorizedAtSlot",
            "type": "u64"
          },
          {
            "name": "expiresAtSlot",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "envelopeClosed",
      "docs": [
        "Emitted when an expired or consumed RiskEnvelope account is closed."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "envelope",
            "type": "pubkey"
          },
          {
            "name": "closedBy",
            "type": "pubkey"
          },
          {
            "name": "refundTo",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "envelopeConsumed",
      "docs": [
        "Emitted when a RiskEnvelope capability token is consumed by an authorized operation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "envelope",
            "type": "pubkey"
          },
          {
            "name": "actor",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": "u8"
          },
          {
            "name": "venue",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "consumedAtSlot",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "guardReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "ok"
          },
          {
            "name": "staleOracle"
          },
          {
            "name": "confidenceTooWide"
          },
          {
            "name": "marketClosed"
          },
          {
            "name": "invalidPrice"
          },
          {
            "name": "custodyImpaired"
          },
          {
            "name": "liquidityCritical"
          },
          {
            "name": "liquidityThin"
          },
          {
            "name": "ratchetDefensive"
          },
          {
            "name": "ratchetRecoveryPending"
          }
        ]
      }
    },
    {
      "name": "liquidateEvent",
      "docs": [
        "Emitted when an unhealthy position is liquidated."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "debtRepaid",
            "type": "u64"
          },
          {
            "name": "collateralSeized",
            "type": "u64"
          },
          {
            "name": "bonusBps",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "liquidationAuction",
      "docs": [
        "Liquidation Auction PDA - one per active auction for a position.",
        "",
        "Seeds: [\"auction\", position.key().as_ref()]",
        "",
        "Bounded continuous Dutch auction recovery engine.",
        "Ramps discount linearly from floor discount to max discount over duration."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "docs": [
              "The position PDA being liquidated"
            ],
            "type": "pubkey"
          },
          {
            "name": "startSlot",
            "docs": [
              "The slot at which the liquidation auction was initiated"
            ],
            "type": "u64"
          },
          {
            "name": "startPrice",
            "docs": [
              "Starting price of the Dutch auction P_start = P_ref * (1 - D_start)"
            ],
            "type": "i64"
          },
          {
            "name": "startExpo",
            "docs": [
              "Exponent for start_price"
            ],
            "type": "i32"
          },
          {
            "name": "initialDebt",
            "docs": [
              "Debt amount at auction start (in quote token units)"
            ],
            "type": "u64"
          },
          {
            "name": "initiator",
            "docs": [
              "Caller/crank that initialized the auction (receives rent refund upon resolution)"
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          },
          {
            "name": "auctionId",
            "docs": [
              "Monotonic auction sequence ID"
            ],
            "type": "u64"
          },
          {
            "name": "collateralMint",
            "docs": [
              "Collateral token mint being auctioned"
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "docs": [
              "Collateral amount in the auction"
            ],
            "type": "u64"
          },
          {
            "name": "referencePrice",
            "docs": [
              "Validated reference oracle price at auction start"
            ],
            "type": "i64"
          },
          {
            "name": "referenceExpo",
            "docs": [
              "Reference price exponent (e.g., -8)"
            ],
            "type": "i32"
          },
          {
            "name": "floorPrice",
            "docs": [
              "Floor price of the Dutch auction P_floor = P_ref * (1 - D_max)"
            ],
            "type": "i64"
          },
          {
            "name": "endSlot",
            "docs": [
              "Solana slot at auction conclusion"
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "docs": [
              "Start unix timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "End unix timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "riskStateAtStart",
            "docs": [
              "Risk state at the moment auction opened"
            ],
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "riskEpoch",
            "docs": [
              "Monotonic risk epoch at auction start"
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "Current lifecycle status (Active, Settled, Expired, Cancelled)"
            ],
            "type": {
              "defined": {
                "name": "auctionStatus"
              }
            }
          },
          {
            "name": "settledAmount",
            "docs": [
              "Settled collateral amount so far"
            ],
            "type": "u64"
          },
          {
            "name": "debtRepaid",
            "docs": [
              "Total debt repaid so far"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidityState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "deep"
          },
          {
            "name": "normal"
          },
          {
            "name": "thin"
          },
          {
            "name": "critical"
          }
        ]
      }
    },
    {
      "name": "marketGuard",
      "docs": [
        "Cached market guard state - one PDA per Pyth feed.",
        "",
        "Seeds: [\"guard\", pyth_feed_id]",
        "",
        "Updated by the permissionless `refresh_guard` instruction.",
        "Stores observability state and the last-valid oracle snapshot.",
        "",
        "SECURITY: This cached state is for observability/UI only.",
        "borrow/withdraw instructions MUST independently re-validate",
        "oracle and market conditions. Do not trust this as sole authorization."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "The Pyth feed ID this guard monitors"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "lastValidPrice",
            "docs": [
              "Last validated oracle price (stored only after successful validation).",
              "Used as emergency liquidation reference when current oracle is invalid.",
              "INVARIANT: Only updated when oracle validation fully succeeds."
            ],
            "type": "i64"
          },
          {
            "name": "lastValidExpo",
            "docs": [
              "Exponent for last_valid_price (e.g., -8 means price * 10^-8)"
            ],
            "type": "i32"
          },
          {
            "name": "lastPublishTime",
            "docs": [
              "Unix timestamp of the last valid oracle publish time"
            ],
            "type": "i64"
          },
          {
            "name": "marketState",
            "docs": [
              "Current derived market state"
            ],
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "reason",
            "docs": [
              "Reason for the current market state"
            ],
            "type": {
              "defined": {
                "name": "guardReason"
              }
            }
          },
          {
            "name": "lastCheckedSlot",
            "docs": [
              "Solana slot at which guard was last checked/updated"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "safe"
          },
          {
            "name": "restricted"
          },
          {
            "name": "defensive"
          },
          {
            "name": "emergency"
          }
        ]
      }
    },
    {
      "name": "permissionDenialReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "ok"
          },
          {
            "name": "protocolPaused"
          },
          {
            "name": "assetDisabled"
          },
          {
            "name": "riskRestricted"
          },
          {
            "name": "riskDefensive"
          },
          {
            "name": "riskEmergency"
          },
          {
            "name": "borrowNotPermitted"
          },
          {
            "name": "withdrawNotPermitted"
          },
          {
            "name": "agentAuthorityExpired"
          },
          {
            "name": "agentActionNotPermitted"
          },
          {
            "name": "agentBorrowLimitExceeded"
          },
          {
            "name": "agentWithdrawLimitExceeded"
          },
          {
            "name": "insufficientRiskBudget"
          },
          {
            "name": "healthFactorTooLow"
          },
          {
            "name": "effectiveLtvExceeded"
          },
          {
            "name": "marketClosed"
          },
          {
            "name": "confidenceTooWide"
          },
          {
            "name": "oracleUnsafe"
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "User collateral position - one PDA per (owner, asset) pair.",
        "",
        "Seeds: [\"position\", owner.key(), asset_mint.key()]",
        "",
        "Tracks deposited collateral, outstanding debt, and the last",
        "validated oracle snapshot for emergency liquidation reference."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "The wallet that owns this position"
            ],
            "type": "pubkey"
          },
          {
            "name": "asset",
            "docs": [
              "The equity token mint this position is collateralized with"
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "docs": [
              "Amount of equity tokens deposited as collateral (in token native units)"
            ],
            "type": "u64"
          },
          {
            "name": "debtAmount",
            "docs": [
              "Amount of quote tokens borrowed (in quote token native units)"
            ],
            "type": "u64"
          },
          {
            "name": "lastValidPrice",
            "docs": [
              "Last validated oracle price snapshot.",
              "Updated only after successful oracle validation during borrow/withdraw.",
              "Used as emergency liquidation reference when current oracle is invalid."
            ],
            "type": "i64"
          },
          {
            "name": "lastValidExpo",
            "docs": [
              "Exponent for last_valid_price"
            ],
            "type": "i32"
          },
          {
            "name": "state",
            "docs": [
              "Current position health state"
            ],
            "type": {
              "defined": {
                "name": "positionState"
              }
            }
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "positionState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "healthy"
          },
          {
            "name": "liquidatable"
          }
        ]
      }
    },
    {
      "name": "priceFeedMessage",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "docs": [
              "The timestamp of this price update in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "prevPublishTime",
            "docs": [
              "The timestamp of the previous price update. This field is intended to allow users to",
              "identify the single unique price update for any moment in time:",
              "for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.",
              "",
              "Note that there may not be such an update while we are migrating to the new message-sending logic,",
              "as some price updates on pythnet may not be sent to other chains (because the message-sending",
              "logic may not have triggered). We can solve this problem by making the message-sending mandatory",
              "(which we can do once publishers have migrated over).",
              "",
              "Additionally, this field may be equal to publish_time if the message is sent on a slot where",
              "where the aggregation was unsuccesful. This problem will go away once all publishers have",
              "migrated over to a recent version of pyth-agent."
            ],
            "type": "i64"
          },
          {
            "name": "emaPrice",
            "type": "i64"
          },
          {
            "name": "emaConf",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateV2",
      "docs": [
        "A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.",
        "It contains:",
        "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.",
        "- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.",
        "- `price_message`: The actual price update.",
        "- `posted_slot`: The slot at which this price update was posted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "verificationLevel",
            "type": {
              "defined": {
                "name": "verificationLevel"
              }
            }
          },
          {
            "name": "priceMessage",
            "type": {
              "defined": {
                "name": "priceFeedMessage"
              }
            }
          },
          {
            "name": "postedSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "protocolConfig",
      "docs": [
        "Global protocol configuration - singleton PDA.",
        "",
        "Seeds: [\"protocol\"]",
        "",
        "Controls pause state, health factor minimums, oracle defaults,",
        "and liquidation parameters. Only the designated authority can modify."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Admin authority that can modify protocol parameters"
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "When true, risk-increasing operations (borrow, withdraw) are blocked.",
              "Deposit, repay, and liquidation remain available."
            ],
            "type": "bool"
          },
          {
            "name": "version",
            "docs": [
              "Protocol version for future upgrade tracking"
            ],
            "type": "u16"
          },
          {
            "name": "minHealthFactorBps",
            "docs": [
              "Minimum health factor in BPS (10000 = 1.0).",
              "Positions below this threshold become liquidatable."
            ],
            "type": "u64"
          },
          {
            "name": "defaultMaxOracleAge",
            "docs": [
              "Default maximum oracle age in seconds.",
              "Used when AssetConfig doesn't override."
            ],
            "type": "u64"
          },
          {
            "name": "defaultMaxConfBps",
            "docs": [
              "Default maximum confidence width in BPS.",
              "conf * BPS_SCALE / price must be <= this value."
            ],
            "type": "u64"
          },
          {
            "name": "liquidationBonusBps",
            "docs": [
              "Global liquidation bonus in BPS.",
              "Liquidators receive this % bonus on seized collateral."
            ],
            "type": "u64"
          },
          {
            "name": "feeRecipient",
            "docs": [
              "Treasury recipient that receives protocol fees"
            ],
            "type": "pubkey"
          },
          {
            "name": "borrowFeeBps",
            "docs": [
              "Protocol origination / credit execution fee in BPS (e.g., 25 = 0.25%)"
            ],
            "type": "u64"
          },
          {
            "name": "feeEnabled",
            "docs": [
              "Whether protocol fee collection is currently active"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "protocolFeeCollected",
      "docs": [
        "Emitted when a protocol origination fee is settled directly to Circuit Treasury."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          },
          {
            "name": "feeAsset",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "sourceAction",
            "type": "string"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "protocolVersion",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "recoveryObserved",
      "docs": [
        "Emitted when a healthy crank observation contributes to monotonic recovery."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "riskEpoch",
            "type": "u64"
          },
          {
            "name": "currentState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "consecutiveObservations",
            "type": "u32"
          },
          {
            "name": "requiredObservations",
            "type": "u32"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "repayEvent",
      "docs": [
        "Emitted when debt is repaid for a position."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "remainingDebt",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "riskBudgetChanged",
      "docs": [
        "Emitted when an agent's dynamic risk budget changes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oldBudget",
            "type": "u64"
          },
          {
            "name": "newBudget",
            "type": "u64"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "agentAction"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "riskEnvelope",
      "docs": [
        "Dedicated Risk Envelope state PDA.",
        "",
        "An onchain, short-lived capability token that represents bounded authority:",
        "\"This actor may perform this exact type of capital action, against this asset/venue,",
        "up to this amount, under these market conditions, until this slot.\"",
        "",
        "Seeds: [b\"envelope\", owner.as_ref(), actor.as_ref(), asset_mint.as_ref(), &nonce.to_le_bytes()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "The collateral position owner delegating or executing"
            ],
            "type": "pubkey"
          },
          {
            "name": "actor",
            "docs": [
              "The authorized actor (human wallet or delegated agent)"
            ],
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "docs": [
              "The asset / market mint (e.g. NVDA, AAPL)"
            ],
            "type": "pubkey"
          },
          {
            "name": "venue",
            "docs": [
              "Execution venue (0 = Credit / Lending, 1 = Meteora DBC, 2 = Trading)"
            ],
            "type": "u8"
          },
          {
            "name": "action",
            "docs": [
              "Authorized action type (1 = Borrow, 2 = Withdraw, 3 = Swap, etc.)"
            ],
            "type": "u8"
          },
          {
            "name": "maxNotional",
            "docs": [
              "Maximum authorized notional amount (in token/quote base units)"
            ],
            "type": "u64"
          },
          {
            "name": "maxLtvBps",
            "docs": [
              "Maximum authorized LTV in basis points (e.g. 5000 = 50%)"
            ],
            "type": "u64"
          },
          {
            "name": "maxSlippageBps",
            "docs": [
              "Maximum slippage in basis points (for DEX/DBC venues)"
            ],
            "type": "u64"
          },
          {
            "name": "riskState",
            "docs": [
              "Market risk state at time of authorization"
            ],
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "oracleFreshness",
            "docs": [
              "Oracle freshness at time of authorization (seconds age)"
            ],
            "type": "u64"
          },
          {
            "name": "confidenceLimitBps",
            "docs": [
              "Confidence limit / observed confidence in basis points"
            ],
            "type": "u64"
          },
          {
            "name": "oraclePrice",
            "docs": [
              "Validated oracle price snapshot at authorization"
            ],
            "type": "i64"
          },
          {
            "name": "oracleExpo",
            "docs": [
              "Validated oracle exponent at authorization"
            ],
            "type": "i32"
          },
          {
            "name": "policyVersion",
            "docs": [
              "Authoritative capital policy version evaluated"
            ],
            "type": "u16"
          },
          {
            "name": "riskEpoch",
            "docs": [
              "Monotonic risk epoch at creation (stale envelope rejection if market shifts)"
            ],
            "type": "u64"
          },
          {
            "name": "authorizedAtSlot",
            "docs": [
              "Slot at which this envelope was authorized"
            ],
            "type": "u64"
          },
          {
            "name": "expiresAtSlot",
            "docs": [
              "Slot at which this envelope strictly expires"
            ],
            "type": "u64"
          },
          {
            "name": "nonce",
            "docs": [
              "Unique nonce for replay protection and PDA uniqueness"
            ],
            "type": "u64"
          },
          {
            "name": "consumed",
            "docs": [
              "Single-use consumption flag (set to true upon execution)"
            ],
            "type": "bool"
          },
          {
            "name": "consumedAtSlot",
            "docs": [
              "Slot at which envelope was consumed (0 if active)"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "riskRatchet",
      "docs": [
        "Dedicated Risk Ratchet state PDA - one per Pyth feed.",
        "",
        "Seeds: [ratchet, pyth_feed_id]",
        "",
        "Implements the 4-state risk machine (Safe, Restricted, Defensive, Emergency).",
        "Enforces asymmetric fast tightening and monotonic staged recovery with hysteresis."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "The Pyth feed ID this ratchet governs"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "state",
            "docs": [
              "Current risk ratchet state"
            ],
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "reason",
            "docs": [
              "Reason for current risk state"
            ],
            "type": {
              "defined": {
                "name": "guardReason"
              }
            }
          },
          {
            "name": "riskEpoch",
            "docs": [
              "Cumulative counter of adverse condition breaches / stress events"
            ],
            "type": "u64"
          },
          {
            "name": "transitionNonce",
            "docs": [
              "Monotonically increasing state-transition nonce (increments on every state change)"
            ],
            "type": "u64"
          },
          {
            "name": "consecutiveHealthyObservations",
            "docs": [
              "Consecutive healthy crank observations at the current recovery tier"
            ],
            "type": "u32"
          },
          {
            "name": "lastStressSlot",
            "docs": [
              "Solana slot at which the most recent risk breach occurred"
            ],
            "type": "u64"
          },
          {
            "name": "lastUpdatedSlot",
            "docs": [
              "Solana slot at which ratchet was last updated"
            ],
            "type": "u64"
          },
          {
            "name": "lastTransitionTs",
            "docs": [
              "Unix timestamp at which the most recent state transition occurred"
            ],
            "type": "i64"
          },
          {
            "name": "riskScore",
            "docs": [
              "Composite dynamic risk score in basis points [0, 10_000]"
            ],
            "type": "u32"
          },
          {
            "name": "previousScore",
            "docs": [
              "Previous observation risk score in basis points [0, 10_000]"
            ],
            "type": "u32"
          },
          {
            "name": "riskVelocity",
            "docs": [
              "Rate of risk change per second (signed i32 in bps/sec)"
            ],
            "type": "i32"
          },
          {
            "name": "marketScore",
            "docs": [
              "Breakdown: market condition risk score [0, 10_000]"
            ],
            "type": "u32"
          },
          {
            "name": "capitalScore",
            "docs": [
              "Breakdown: capital/liquidity risk score [0, 10_000]"
            ],
            "type": "u32"
          },
          {
            "name": "oracleScore",
            "docs": [
              "Breakdown: oracle uncertainty and age score [0, 10_000]"
            ],
            "type": "u32"
          },
          {
            "name": "cooldownSeconds",
            "docs": [
              "Required cooldown duration in seconds before recovery transitions"
            ],
            "type": "u32"
          },
          {
            "name": "policyVersion",
            "docs": [
              "Active capital policy version"
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "riskStateChanged",
      "docs": [
        "Emitted when the 4-state Risk Ratchet transitions to a new state."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "riskEpoch",
            "type": "u64"
          },
          {
            "name": "previousState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "newState",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "guardReason"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "verificationLevel",
      "docs": [
        "Pyth price updates are bridged to all blockchains via Wormhole.",
        "Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.",
        "The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,",
        "so we also allow for partial verification.",
        "",
        "This enum represents how much a price update has been verified:",
        "- If `Full`, we have verified the signatures for two thirds of the current guardians.",
        "- If `Partial`, only `num_signatures` guardian signatures have been checked.",
        "",
        "# Warning",
        "Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "partial",
            "fields": [
              {
                "name": "numSignatures",
                "type": "u8"
              }
            ]
          },
          {
            "name": "full"
          }
        ]
      }
    },
    {
      "name": "withdrawEvent",
      "docs": [
        "Emitted when a user withdraws collateral from their position."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "remainingCollateral",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
