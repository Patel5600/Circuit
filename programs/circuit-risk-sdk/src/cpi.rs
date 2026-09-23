use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
};
use crate::constants::CIRCUIT_PROGRAM_ID;
use crate::types::RiskRequest;

// ── Anchor Instruction Discriminators (sha256("global:<name>")[..8]) ───────

/// Discriminator for `authorize_action`: sha256("global:authorize_action")[..8]
pub const AUTHORIZE_ACTION_DISCRIMINATOR: [u8; 8] = [11, 87, 202, 95, 221, 45, 38, 210];

/// Discriminator for `consume_envelope`: sha256("global:consume_envelope")[..8]
pub const CONSUME_ENVELOPE_DISCRIMINATOR: [u8; 8] = [178, 151, 217, 31, 60, 195, 207, 194];

/// Discriminator for `close_envelope`: sha256("global:close_envelope")[..8]
pub const CLOSE_ENVELOPE_DISCRIMINATOR: [u8; 8] = [140, 198, 50, 187, 85, 89, 13, 23];

// ── Account Key Collections ────────────────────────────────────────────────

/// Account public keys required to build an `authorize_action` instruction.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthorizeAccounts {
    pub payer: Pubkey,
    pub owner: Pubkey,
    pub actor: Pubkey,
    pub protocol_config: Pubkey,
    pub asset_config: Pubkey,
    pub risk_ratchet: Pubkey,
    pub position: Pubkey,
    pub agent_authority: Pubkey,
    pub envelope: Pubkey,
    pub price_update: Pubkey,
    pub system_program: Pubkey,
}

impl AuthorizeAccounts {
    /// Builds the `authorize_action` instruction for this accounts collection.
    pub fn to_instruction(&self, request: &RiskRequest) -> Instruction {
        build_authorize_instruction(
            &self.payer,
            &self.owner,
            &self.actor,
            &self.protocol_config,
            &self.asset_config,
            &self.risk_ratchet,
            &self.position,
            &self.agent_authority,
            &self.envelope,
            &self.price_update,
            &self.system_program,
            request,
        )
    }
}

/// Account public keys required to build a `consume_envelope` instruction.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsumeAccounts {
    pub actor: Pubkey,
    pub envelope: Pubkey,
    pub risk_ratchet: Pubkey,
}

impl ConsumeAccounts {
    /// Builds the `consume_envelope` instruction for this accounts collection.
    pub fn to_instruction(&self, action: u8, venue: u8, amount: u64) -> Instruction {
        build_consume_instruction(
            &self.actor,
            &self.envelope,
            &self.risk_ratchet,
            action,
            venue,
            amount,
        )
    }
}

/// Account public keys required to build a `close_envelope` instruction.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CloseAccounts {
    pub closer: Pubkey,
    pub owner: Pubkey,
    pub envelope: Pubkey,
}

impl CloseAccounts {
    /// Builds the `close_envelope` instruction for this accounts collection.
    pub fn to_instruction(&self) -> Instruction {
        build_close_instruction(&self.closer, &self.owner, &self.envelope)
    }
}

// ── Anchor CPI Account Contexts ────────────────────────────────────────────

/// Account infos required for CPI invocation of `authorize_action`.
#[derive(Clone)]
pub struct Authorize<'info> {
    pub payer: AccountInfo<'info>,
    pub owner: AccountInfo<'info>,
    pub actor: AccountInfo<'info>,
    pub protocol_config: AccountInfo<'info>,
    pub asset_config: AccountInfo<'info>,
    pub risk_ratchet: AccountInfo<'info>,
    pub position: AccountInfo<'info>,
    pub agent_authority: AccountInfo<'info>,
    pub envelope: AccountInfo<'info>,
    pub price_update: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
}

pub type AuthorizeAction<'info> = Authorize<'info>;
pub type AuthorizeAccountsInfo<'info> = Authorize<'info>;

impl<'info> ToAccountMetas for Authorize<'info> {
    fn to_account_metas(&self, _is_signer: Option<bool>) -> Vec<AccountMeta> {
        vec![
            AccountMeta::new(*self.payer.key, true),
            AccountMeta::new_readonly(*self.owner.key, false),
            AccountMeta::new_readonly(*self.actor.key, true),
            AccountMeta::new_readonly(*self.protocol_config.key, false),
            AccountMeta::new_readonly(*self.asset_config.key, false),
            AccountMeta::new_readonly(*self.risk_ratchet.key, false),
            AccountMeta::new_readonly(*self.position.key, false),
            AccountMeta::new_readonly(*self.agent_authority.key, false),
            AccountMeta::new(*self.envelope.key, false),
            AccountMeta::new_readonly(*self.price_update.key, false),
            AccountMeta::new_readonly(*self.system_program.key, false),
        ]
    }
}

impl<'info> ToAccountInfos<'info> for Authorize<'info> {
    fn to_account_infos(&self) -> Vec<AccountInfo<'info>> {
        vec![
            self.payer.clone(),
            self.owner.clone(),
            self.actor.clone(),
            self.protocol_config.clone(),
            self.asset_config.clone(),
            self.risk_ratchet.clone(),
            self.position.clone(),
            self.agent_authority.clone(),
            self.envelope.clone(),
            self.price_update.clone(),
            self.system_program.clone(),
        ]
    }
}

/// Account infos required for CPI invocation of `consume_envelope`.
#[derive(Clone)]
pub struct Consume<'info> {
    pub actor: AccountInfo<'info>,
    pub envelope: AccountInfo<'info>,
    pub risk_ratchet: AccountInfo<'info>,
}

pub type ConsumeEnvelope<'info> = Consume<'info>;
pub type ConsumeAccountsInfo<'info> = Consume<'info>;

impl<'info> ToAccountMetas for Consume<'info> {
    fn to_account_metas(&self, _is_signer: Option<bool>) -> Vec<AccountMeta> {
        vec![
            AccountMeta::new_readonly(*self.actor.key, true),
            AccountMeta::new(*self.envelope.key, false),
            AccountMeta::new_readonly(*self.risk_ratchet.key, false),
        ]
    }
}

impl<'info> ToAccountInfos<'info> for Consume<'info> {
    fn to_account_infos(&self) -> Vec<AccountInfo<'info>> {
        vec![
            self.actor.clone(),
            self.envelope.clone(),
            self.risk_ratchet.clone(),
        ]
    }
}

/// Account infos required for CPI invocation of `close_envelope`.
#[derive(Clone)]
pub struct Close<'info> {
    pub closer: AccountInfo<'info>,
    pub owner: AccountInfo<'info>,
    pub envelope: AccountInfo<'info>,
}

pub type CloseEnvelope<'info> = Close<'info>;
pub type CloseAccountsInfo<'info> = Close<'info>;

impl<'info> ToAccountMetas for Close<'info> {
    fn to_account_metas(&self, _is_signer: Option<bool>) -> Vec<AccountMeta> {
        vec![
            AccountMeta::new_readonly(*self.closer.key, true),
            AccountMeta::new(*self.owner.key, false),
            AccountMeta::new(*self.envelope.key, false),
        ]
    }
}

impl<'info> ToAccountInfos<'info> for Close<'info> {
    fn to_account_infos(&self) -> Vec<AccountInfo<'info>> {
        vec![
            self.closer.clone(),
            self.owner.clone(),
            self.envelope.clone(),
        ]
    }
}

// ── Instruction Builders ───────────────────────────────────────────────────

/// Creates a `solana_program::instruction::Instruction` targeting Circuit Program ID
/// for `authorize_action` with custom program ID.
pub fn build_authorize_instruction_with_program(
    program_id: &Pubkey,
    payer: &Pubkey,
    owner: &Pubkey,
    actor: &Pubkey,
    protocol_config: &Pubkey,
    asset_config: &Pubkey,
    risk_ratchet: &Pubkey,
    position: &Pubkey,
    agent_authority: &Pubkey,
    envelope: &Pubkey,
    price_update: &Pubkey,
    system_program: &Pubkey,
    request: &RiskRequest,
) -> Instruction {
    let mut data = Vec::with_capacity(42);
    data.extend_from_slice(&AUTHORIZE_ACTION_DISCRIMINATOR);
    data.push(request.action);
    data.push(request.venue);
    data.extend_from_slice(&request.requested_amount.to_le_bytes());
    data.extend_from_slice(&request.max_slippage_bps.to_le_bytes());
    data.extend_from_slice(&request.nonce.to_le_bytes());
    data.extend_from_slice(&request.ttl_slots.to_le_bytes());

    let accounts = vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(*owner, false),
        AccountMeta::new_readonly(*actor, true),
        AccountMeta::new_readonly(*protocol_config, false),
        AccountMeta::new_readonly(*asset_config, false),
        AccountMeta::new_readonly(*risk_ratchet, false),
        AccountMeta::new_readonly(*position, false),
        AccountMeta::new_readonly(*agent_authority, false),
        AccountMeta::new(*envelope, false),
        AccountMeta::new_readonly(*price_update, false),
        AccountMeta::new_readonly(*system_program, false),
    ];

    Instruction {
        program_id: *program_id,
        accounts,
        data,
    }
}

/// Creates a `solana_program::instruction::Instruction` targeting Circuit Program ID
/// with required accounts:
/// payer, owner, actor, protocol_config, asset_config, risk_ratchet, position,
/// agent_authority, envelope PDA, price_update, system_program.
pub fn build_authorize_instruction(
    payer: &Pubkey,
    owner: &Pubkey,
    actor: &Pubkey,
    protocol_config: &Pubkey,
    asset_config: &Pubkey,
    risk_ratchet: &Pubkey,
    position: &Pubkey,
    agent_authority: &Pubkey,
    envelope: &Pubkey,
    price_update: &Pubkey,
    system_program: &Pubkey,
    request: &RiskRequest,
) -> Instruction {
    build_authorize_instruction_with_program(
        &CIRCUIT_PROGRAM_ID,
        payer,
        owner,
        actor,
        protocol_config,
        asset_config,
        risk_ratchet,
        position,
        agent_authority,
        envelope,
        price_update,
        system_program,
        request,
    )
}

/// Creates a `solana_program::instruction::Instruction` targeting Circuit Program ID
/// from an `AuthorizeAccounts` struct and a `RiskRequest`.
pub fn build_authorize_instruction_accounts(
    accounts: &AuthorizeAccounts,
    request: &RiskRequest,
) -> Instruction {
    build_authorize_instruction(
        &accounts.payer,
        &accounts.owner,
        &accounts.actor,
        &accounts.protocol_config,
        &accounts.asset_config,
        &accounts.risk_ratchet,
        &accounts.position,
        &accounts.agent_authority,
        &accounts.envelope,
        &accounts.price_update,
        &accounts.system_program,
        request,
    )
}

/// Creates a `solana_program::instruction::Instruction` targeting Circuit Program ID
/// for `consume_envelope` with custom program ID.
pub fn build_consume_instruction_with_program(
    program_id: &Pubkey,
    actor: &Pubkey,
    envelope: &Pubkey,
    risk_ratchet: &Pubkey,
    action: u8,
    venue: u8,
    amount: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(18);
    data.extend_from_slice(&CONSUME_ENVELOPE_DISCRIMINATOR);
    data.push(action);
    data.push(venue);
    data.extend_from_slice(&amount.to_le_bytes());

    let accounts = vec![
        AccountMeta::new_readonly(*actor, true),
        AccountMeta::new(*envelope, false),
        AccountMeta::new_readonly(*risk_ratchet, false),
    ];

    Instruction {
        program_id: *program_id,
        accounts,
        data,
    }
}

/// Helper function `build_consume_instruction`:
/// Takes actor, envelope, risk_ratchet, action, venue, amount.
/// Creates `solana_program::instruction::Instruction` targeting Circuit Program ID.
pub fn build_consume_instruction(
    actor: &Pubkey,
    envelope: &Pubkey,
    risk_ratchet: &Pubkey,
    action: u8,
    venue: u8,
    amount: u64,
) -> Instruction {
    build_consume_instruction_with_program(
        &CIRCUIT_PROGRAM_ID,
        actor,
        envelope,
        risk_ratchet,
        action,
        venue,
        amount,
    )
}

/// Creates a `solana_program::instruction::Instruction` targeting Circuit Program ID
/// for `close_envelope` with custom program ID.
pub fn build_close_instruction_with_program(
    program_id: &Pubkey,
    closer: &Pubkey,
    owner: &Pubkey,
    envelope: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*closer, true),
        AccountMeta::new(*owner, false),
        AccountMeta::new(*envelope, false),
    ];

    Instruction {
        program_id: *program_id,
        accounts,
        data: CLOSE_ENVELOPE_DISCRIMINATOR.to_vec(),
    }
}

/// Helper function `build_close_instruction`:
/// Takes closer, owner, envelope.
/// Creates `solana_program::instruction::Instruction` targeting Circuit Program ID.
pub fn build_close_instruction(
    closer: &Pubkey,
    owner: &Pubkey,
    envelope: &Pubkey,
) -> Instruction {
    build_close_instruction_with_program(&CIRCUIT_PROGRAM_ID, closer, owner, envelope)
}

// ── CPI Invocations ────────────────────────────────────────────────────────

/// Helper function `authorize`:
/// Takes CPI context and `RiskRequest`, executes CPI via `solana_program::program::invoke` or `invoke_signed`.
pub fn authorize<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Authorize<'info>>,
    request: RiskRequest,
) -> anchor_lang::Result<()> {
    let ix = build_authorize_instruction(
        ctx.accounts.payer.key,
        ctx.accounts.owner.key,
        ctx.accounts.actor.key,
        ctx.accounts.protocol_config.key,
        ctx.accounts.asset_config.key,
        ctx.accounts.risk_ratchet.key,
        ctx.accounts.position.key,
        ctx.accounts.agent_authority.key,
        ctx.accounts.envelope.key,
        ctx.accounts.price_update.key,
        ctx.accounts.system_program.key,
        &request,
    );

    let mut account_infos = ctx.accounts.to_account_infos();
    account_infos.extend_from_slice(&ctx.remaining_accounts);

    if ctx.signer_seeds.is_empty() {
        invoke(&ix, &account_infos)?;
    } else {
        invoke_signed(&ix, &account_infos, ctx.signer_seeds)?;
    }

    Ok(())
}

/// Helper function `consume`:
/// Takes actor, envelope, risk_ratchet, action, venue, amount.
/// Executes CPI to consume an authorized RiskEnvelope.
pub fn consume<'info>(
    actor: &AccountInfo<'info>,
    envelope: &AccountInfo<'info>,
    risk_ratchet: &AccountInfo<'info>,
    action: u8,
    venue: u8,
    amount: u64,
) -> ProgramResult {
    let ix = build_consume_instruction(
        actor.key,
        envelope.key,
        risk_ratchet.key,
        action,
        venue,
        amount,
    );
    invoke(&ix, &[actor.clone(), envelope.clone(), risk_ratchet.clone()])
}

/// Executes CPI to consume an authorized RiskEnvelope with signer seeds.
pub fn consume_signed<'info>(
    actor: &AccountInfo<'info>,
    envelope: &AccountInfo<'info>,
    risk_ratchet: &AccountInfo<'info>,
    action: u8,
    venue: u8,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = build_consume_instruction(
        actor.key,
        envelope.key,
        risk_ratchet.key,
        action,
        venue,
        amount,
    );
    invoke_signed(
        &ix,
        &[actor.clone(), envelope.clone(), risk_ratchet.clone()],
        signer_seeds,
    )
}

/// Executes CPI via Anchor CpiContext for `consume_envelope`.
pub fn consume_with_context<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Consume<'info>>,
    action: u8,
    venue: u8,
    amount: u64,
) -> anchor_lang::Result<()> {
    let ix = build_consume_instruction(
        ctx.accounts.actor.key,
        ctx.accounts.envelope.key,
        ctx.accounts.risk_ratchet.key,
        action,
        venue,
        amount,
    );

    let mut account_infos = ctx.accounts.to_account_infos();
    account_infos.extend_from_slice(&ctx.remaining_accounts);

    if ctx.signer_seeds.is_empty() {
        invoke(&ix, &account_infos)?;
    } else {
        invoke_signed(&ix, &account_infos, ctx.signer_seeds)?;
    }

    Ok(())
}

/// Helper function `close`:
/// Takes closer, owner, envelope.
/// Executes CPI to close a consumed or expired RiskEnvelope, reclaiming rent back to owner.
pub fn close<'info>(
    closer: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    envelope: &AccountInfo<'info>,
) -> ProgramResult {
    let ix = build_close_instruction(closer.key, owner.key, envelope.key);
    invoke(&ix, &[closer.clone(), owner.clone(), envelope.clone()])
}

/// Executes CPI to close a consumed or expired RiskEnvelope with signer seeds.
pub fn close_signed<'info>(
    closer: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    envelope: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = build_close_instruction(closer.key, owner.key, envelope.key);
    invoke_signed(
        &ix,
        &[closer.clone(), owner.clone(), envelope.clone()],
        signer_seeds,
    )
}

/// Executes CPI via Anchor CpiContext for `close_envelope`.
pub fn close_with_context<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Close<'info>>,
) -> anchor_lang::Result<()> {
    let ix = build_close_instruction(
        ctx.accounts.closer.key,
        ctx.accounts.owner.key,
        ctx.accounts.envelope.key,
    );

    let mut account_infos = ctx.accounts.to_account_infos();
    account_infos.extend_from_slice(&ctx.remaining_accounts);

    if ctx.signer_seeds.is_empty() {
        invoke(&ix, &account_infos)?;
    } else {
        invoke_signed(&ix, &account_infos, ctx.signer_seeds)?;
    }

    Ok(())
}

// ── Unit Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discriminators_match_anchor_sha256() {
        assert_eq!(
            AUTHORIZE_ACTION_DISCRIMINATOR,
            [11, 87, 202, 95, 221, 45, 38, 210]
        );
        assert_eq!(
            CONSUME_ENVELOPE_DISCRIMINATOR,
            [178, 151, 217, 31, 60, 195, 207, 194]
        );
        assert_eq!(
            CLOSE_ENVELOPE_DISCRIMINATOR,
            [140, 198, 50, 187, 85, 89, 13, 23]
        );
    }

    #[test]
    fn test_build_authorize_instruction_layout() {
        let payer = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let protocol_config = Pubkey::new_unique();
        let asset_config = Pubkey::new_unique();
        let risk_ratchet = Pubkey::new_unique();
        let position = Pubkey::new_unique();
        let agent_authority = Pubkey::new_unique();
        let envelope = Pubkey::new_unique();
        let price_update = Pubkey::new_unique();
        let system_program = Pubkey::new_unique();

        let req = RiskRequest {
            action: 1,
            venue: 0,
            requested_amount: 500_000,
            max_slippage_bps: 50,
            nonce: 7,
            ttl_slots: 30,
        };

        let ix = build_authorize_instruction(
            &payer,
            &owner,
            &actor,
            &protocol_config,
            &asset_config,
            &risk_ratchet,
            &position,
            &agent_authority,
            &envelope,
            &price_update,
            &system_program,
            &req,
        );

        assert_eq!(ix.program_id, CIRCUIT_PROGRAM_ID);
        assert_eq!(ix.accounts.len(), 11);

        // Account 0: payer (signer, writable)
        assert_eq!(ix.accounts[0].pubkey, payer);
        assert!(ix.accounts[0].is_signer);
        assert!(ix.accounts[0].is_writable);

        // Account 1: owner (readonly, not signer)
        assert_eq!(ix.accounts[1].pubkey, owner);
        assert!(!ix.accounts[1].is_signer);
        assert!(!ix.accounts[1].is_writable);

        // Account 2: actor (signer, readonly)
        assert_eq!(ix.accounts[2].pubkey, actor);
        assert!(ix.accounts[2].is_signer);
        assert!(!ix.accounts[2].is_writable);

        // Account 3: protocol_config (readonly)
        assert_eq!(ix.accounts[3].pubkey, protocol_config);
        assert!(!ix.accounts[3].is_writable);

        // Account 4: asset_config (readonly)
        assert_eq!(ix.accounts[4].pubkey, asset_config);
        assert!(!ix.accounts[4].is_writable);

        // Account 5: risk_ratchet (readonly)
        assert_eq!(ix.accounts[5].pubkey, risk_ratchet);
        assert!(!ix.accounts[5].is_writable);

        // Account 6: position (readonly)
        assert_eq!(ix.accounts[6].pubkey, position);
        assert!(!ix.accounts[6].is_writable);

        // Account 7: agent_authority (readonly)
        assert_eq!(ix.accounts[7].pubkey, agent_authority);
        assert!(!ix.accounts[7].is_writable);

        // Account 8: envelope (writable, not signer)
        assert_eq!(ix.accounts[8].pubkey, envelope);
        assert!(!ix.accounts[8].is_signer);
        assert!(ix.accounts[8].is_writable);

        // Account 9: price_update (readonly)
        assert_eq!(ix.accounts[9].pubkey, price_update);
        assert!(!ix.accounts[9].is_writable);

        // Account 10: system_program (readonly)
        assert_eq!(ix.accounts[10].pubkey, system_program);
        assert!(!ix.accounts[10].is_writable);

        // Verify data payload: 8 (disc) + 1 + 1 + 8 + 8 + 8 + 8 = 42 bytes
        assert_eq!(ix.data.len(), 42);
        assert_eq!(&ix.data[..8], &AUTHORIZE_ACTION_DISCRIMINATOR);
        assert_eq!(ix.data[8], 1); // action
        assert_eq!(ix.data[9], 0); // venue
        assert_eq!(&ix.data[10..18], &500_000u64.to_le_bytes());
        assert_eq!(&ix.data[18..26], &50u64.to_le_bytes());
        assert_eq!(&ix.data[26..34], &7u64.to_le_bytes());
        assert_eq!(&ix.data[34..42], &30u64.to_le_bytes());
    }

    #[test]
    fn test_build_consume_instruction_layout() {
        let actor = Pubkey::new_unique();
        let envelope = Pubkey::new_unique();
        let risk_ratchet = Pubkey::new_unique();

        let ix = build_consume_instruction(
            &actor,
            &envelope,
            &risk_ratchet,
            2,
            1,
            250_000,
        );

        assert_eq!(ix.program_id, CIRCUIT_PROGRAM_ID);
        assert_eq!(ix.accounts.len(), 3);

        // Account 0: actor (signer, readonly)
        assert_eq!(ix.accounts[0].pubkey, actor);
        assert!(ix.accounts[0].is_signer);
        assert!(!ix.accounts[0].is_writable);

        // Account 1: envelope (writable, not signer)
        assert_eq!(ix.accounts[1].pubkey, envelope);
        assert!(!ix.accounts[1].is_signer);
        assert!(ix.accounts[1].is_writable);

        // Account 2: risk_ratchet (readonly, not signer)
        assert_eq!(ix.accounts[2].pubkey, risk_ratchet);
        assert!(!ix.accounts[2].is_signer);
        assert!(!ix.accounts[2].is_writable);

        // Data payload: 8 (disc) + 1 + 1 + 8 = 18 bytes
        assert_eq!(ix.data.len(), 18);
        assert_eq!(&ix.data[..8], &CONSUME_ENVELOPE_DISCRIMINATOR);
        assert_eq!(ix.data[8], 2);
        assert_eq!(ix.data[9], 1);
        assert_eq!(&ix.data[10..18], &250_000u64.to_le_bytes());
    }

    #[test]
    fn test_build_close_instruction_layout() {
        let closer = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let envelope = Pubkey::new_unique();

        let ix = build_close_instruction(&closer, &owner, &envelope);

        assert_eq!(ix.program_id, CIRCUIT_PROGRAM_ID);
        assert_eq!(ix.accounts.len(), 3);

        // Account 0: closer (signer, readonly)
        assert_eq!(ix.accounts[0].pubkey, closer);
        assert!(ix.accounts[0].is_signer);
        assert!(!ix.accounts[0].is_writable);

        // Account 1: owner (writable, not signer)
        assert_eq!(ix.accounts[1].pubkey, owner);
        assert!(!ix.accounts[1].is_signer);
        assert!(ix.accounts[1].is_writable);

        // Account 2: envelope (writable, not signer)
        assert_eq!(ix.accounts[2].pubkey, envelope);
        assert!(!ix.accounts[2].is_signer);
        assert!(ix.accounts[2].is_writable);

        // Data payload: 8 bytes discriminator
        assert_eq!(ix.data.len(), 8);
        assert_eq!(&ix.data[..8], &CLOSE_ENVELOPE_DISCRIMINATOR);
    }
}
