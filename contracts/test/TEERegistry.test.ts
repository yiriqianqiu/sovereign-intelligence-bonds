import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("TEERegistry", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;
    const [owner, agentOwner, teeWallet, outsider] = await ethers.getSigners();

    // Deploy NFARegistry (required dependency)
    const registry = await (await ethers.getContractFactory("NFARegistry")).deploy();

    // Register an agent as agentOwner
    await registry.connect(agentOwner).registerAgent(
      "TestBot", "Test", "QmHash", "https://test.ai"
    );
    const agentId = 1n;
    await registry.connect(agentOwner).updateState(agentId, 1); // activate

    // Deploy TEERegistry
    const teeRegistry = await (await ethers.getContractFactory("TEERegistry")).deploy(
      await registry.getAddress()
    );

    return { registry, teeRegistry, ethers, networkHelpers, owner, agentOwner, teeWallet, outsider, agentId };
  }

  const SAMPLE_HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  // -- Deployment Tests --

  describe("Deployment", function () {
    it("should deploy with valid nfaCore", async function () {
      const { teeRegistry, registry } = await deployFixture();
      assert.strictEqual(await teeRegistry.nfaCore(), await registry.getAddress());
    });

    it("should revert with zero nfaCore address", async function () {
      const connection = await hre.network.connect();
      const { ethers } = connection;
      const TEERegistry = await ethers.getContractFactory("TEERegistry");
      await assert.rejects(
        async () => { await TEERegistry.deploy("0x0000000000000000000000000000000000000000"); },
        { message: /TEERegistry: zero nfaCore/ }
      );
    });
  });

  // -- authorizeTEEAgent Tests --

  describe("authorizeTEEAgent", function () {
    it("should allow agent owner to authorize a TEE wallet", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      assert.strictEqual(await teeRegistry.authorizedTEEAgent(agentId), teeWallet.address);
    });

    it("should revert if caller is not agent owner", async function () {
      const { teeRegistry, outsider, teeWallet, agentId } = await deployFixture();
      await assert.rejects(
        async () => { await teeRegistry.connect(outsider).authorizeTEEAgent(agentId, teeWallet.address); },
        { message: /TEERegistry: not agent owner/ }
      );
    });

    it("should revert with zero teeWallet address", async function () {
      const { teeRegistry, agentOwner, agentId } = await deployFixture();
      await assert.rejects(
        async () => { await teeRegistry.connect(agentOwner).authorizeTEEAgent(
          agentId, "0x0000000000000000000000000000000000000000"
        ); },
        { message: /TEERegistry: zero teeWallet/ }
      );
    });

    it("should allow updating to a different TEE wallet", async function () {
      const { teeRegistry, agentOwner, teeWallet, outsider, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      assert.strictEqual(await teeRegistry.authorizedTEEAgent(agentId), teeWallet.address);

      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, outsider.address);
      assert.strictEqual(await teeRegistry.authorizedTEEAgent(agentId), outsider.address);
    });
  });

  // -- revokeTEEAgent Tests --

  describe("revokeTEEAgent", function () {
    it("should allow agent owner to revoke TEE authorization", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      await teeRegistry.connect(agentOwner).revokeTEEAgent(agentId);
      assert.strictEqual(
        await teeRegistry.authorizedTEEAgent(agentId),
        "0x0000000000000000000000000000000000000000"
      );
    });

    it("should revert if caller is not agent owner", async function () {
      const { teeRegistry, agentOwner, teeWallet, outsider, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      await assert.rejects(
        async () => { await teeRegistry.connect(outsider).revokeTEEAgent(agentId); },
        { message: /TEERegistry: not agent owner/ }
      );
    });

    it("should revert if no TEE is authorized", async function () {
      const { teeRegistry, agentOwner, agentId } = await deployFixture();
      await assert.rejects(
        async () => { await teeRegistry.connect(agentOwner).revokeTEEAgent(agentId); },
        { message: /TEERegistry: no TEE authorized/ }
      );
    });
  });

  // -- pushTEEAttestation Tests --

  describe("pushTEEAttestation", function () {
    it("should allow authorized TEE to push attestation", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      await teeRegistry.connect(teeWallet).pushTEEAttestation(agentId, SAMPLE_HASH);
      assert.strictEqual(await teeRegistry.teeAttestationHash(agentId), SAMPLE_HASH);
    });

    it("should revert if caller is not authorized TEE", async function () {
      const { teeRegistry, agentOwner, teeWallet, outsider, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      await assert.rejects(
        async () => { await teeRegistry.connect(outsider).pushTEEAttestation(agentId, SAMPLE_HASH); },
        (err: any) => {
          assert.ok(
            err.message.includes("TEERegistry: not authorized TEE") ||
            err.message.includes("reverted")
          );
          return true;
        }
      );
    });

    it("should revert with zero quoteHash", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      await assert.rejects(
        async () => { await teeRegistry.connect(teeWallet).pushTEEAttestation(
          agentId, "0x0000000000000000000000000000000000000000000000000000000000000000"
        ); },
        (err: any) => {
          assert.ok(
            err.message.includes("TEERegistry: zero quoteHash") ||
            err.message.includes("reverted")
          );
          return true;
        }
      );
    });
  });

  // -- isTEEAgent Tests --

  describe("isTEEAgent", function () {
    it("should return true for authorized TEE wallet", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      assert.strictEqual(await teeRegistry.isTEEAgent(agentId, teeWallet.address), true);
    });

    it("should return false for non-authorized address", async function () {
      const { teeRegistry, agentOwner, teeWallet, outsider, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      assert.strictEqual(await teeRegistry.isTEEAgent(agentId, outsider.address), false);
    });

    it("should return false for zero address", async function () {
      const { teeRegistry, agentId } = await deployFixture();
      assert.strictEqual(
        await teeRegistry.isTEEAgent(agentId, "0x0000000000000000000000000000000000000000"),
        false
      );
    });
  });

  // -- getTEEStatus Tests --

  describe("getTEEStatus", function () {
    it("should return isActive=true within 24 hours of attestation", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      await teeRegistry.connect(teeWallet).pushTEEAttestation(agentId, SAMPLE_HASH);

      const status = await teeRegistry.getTEEStatus(agentId);
      assert.strictEqual(status.teeWallet, teeWallet.address);
      assert.strictEqual(status.quoteHash, SAMPLE_HASH);
      assert.strictEqual(status.isActive, true);
    });

    it("should return isActive=false after 24 hours", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId, networkHelpers } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
      await teeRegistry.connect(teeWallet).pushTEEAttestation(agentId, SAMPLE_HASH);

      // Time travel past 24 hours
      await networkHelpers.time.increase(86401);

      const status = await teeRegistry.getTEEStatus(agentId);
      assert.strictEqual(status.teeWallet, teeWallet.address);
      assert.strictEqual(status.isActive, false);
    });

    it("should return isActive=false if no attestation pushed", async function () {
      const { teeRegistry, agentOwner, teeWallet, agentId } = await deployFixture();
      await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);

      const status = await teeRegistry.getTEEStatus(agentId);
      assert.strictEqual(status.teeWallet, teeWallet.address);
      assert.strictEqual(status.isActive, false);
      assert.strictEqual(status.attestedAt, 0n);
    });
  });
});
