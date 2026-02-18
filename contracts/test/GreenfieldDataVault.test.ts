import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("GreenfieldDataVault", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;
    const [owner, user1, user2, verifier] = await ethers.getSigners();

    // Deploy NFARegistry
    const NFARegistry = await ethers.getContractFactory("NFARegistry");
    const registry = await NFARegistry.deploy();

    // Deploy GreenfieldDataVault
    const GreenfieldDataVault = await ethers.getContractFactory("GreenfieldDataVault");
    const vault = await GreenfieldDataVault.deploy(await registry.getAddress());

    return { vault, registry, ethers, networkHelpers, owner, user1, user2, verifier };
  }

  async function deployWithActiveAgentFixture() {
    const base = await deployFixture();
    const { registry, vault, owner, user1, verifier } = base;

    // Register agent as user1
    await registry.connect(user1).registerAgent(
      "TestAgent", "A test agent", "QmModelHash123", "https://agent.example.com/api"
    );
    const agentId = 1n;

    // Activate agent
    await registry.connect(user1).updateState(agentId, 1n);

    // Set verifier
    await vault.connect(owner).setVerifier(verifier.address);

    return { ...base, agentId };
  }

  // Helper: generate a unique content hash from a seed string
  function makeHash(ethers: any, seed: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(seed));
  }

  // -- Deployment and Constructor --

  describe("deployment", function () {
    it("should set nfaRegistry address on construction", async function () {
      const { vault, registry } = await deployFixture();

      assert.strictEqual(
        await vault.nfaRegistry(),
        await registry.getAddress()
      );
    });

    it("should set deployer as owner", async function () {
      const { vault, owner } = await deployFixture();

      assert.strictEqual(await vault.owner(), owner.address);
    });

    it("should initialize verifierAddress as zero address", async function () {
      const { vault, ethers } = await deployFixture();

      assert.strictEqual(await vault.verifierAddress(), ethers.ZeroAddress);
    });

    it("should revert deployment with zero registry address", async function () {
      const { ethers } = await deployFixture();

      const GreenfieldDataVault = await ethers.getContractFactory("GreenfieldDataVault");
      await assert.rejects(
        async () => { await GreenfieldDataVault.deploy(ethers.ZeroAddress); },
        { message: /zero registry/ }
      );
    });
  });

  // -- registerDataAsset --

  describe("registerDataAsset", function () {
    it("should register a data asset successfully", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "model-weights-v1");

      const tx = await vault.connect(user1).registerDataAsset(
        agentId, "sib-bucket", "model/weights.bin", hash, 0n, 1024n
      );
      const receipt = await tx.wait();

      // Check return via getDataAsset
      const asset = await vault.getDataAsset(1n);
      assert.strictEqual(asset.agentId, agentId);
      assert.strictEqual(asset.bucketName, "sib-bucket");
      assert.strictEqual(asset.objectName, "model/weights.bin");
      assert.strictEqual(asset.contentHash, hash);
      assert.strictEqual(asset.dataType, 0n); // Model
      assert.strictEqual(asset.size, 1024n);
      assert.strictEqual(asset.verified, false);
      assert.strictEqual(asset.active, true);
      assert.ok(asset.registeredAt > 0n);
    });

    it("should emit DataAssetRegistered event", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "event-test");

      const tx = await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 1n, 512n
      );
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return vault.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "DataAssetRegistered";
        } catch { return false; }
      });
      assert.ok(event, "DataAssetRegistered event should be emitted");
    });

    it("should auto-increment asset IDs starting from 1", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", makeHash(ethers, "hash1"), 0n, 100n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj2", makeHash(ethers, "hash2"), 1n, 200n
      );

      const asset1 = await vault.getDataAsset(1n);
      const asset2 = await vault.getDataAsset(2n);
      assert.strictEqual(asset1.objectName, "obj1");
      assert.strictEqual(asset2.objectName, "obj2");
    });

    it("should support all DataType enum values", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      // Model=0, Training=1, Performance=2, Inference=3, Config=4
      for (let i = 0; i < 5; i++) {
        await vault.connect(user1).registerDataAsset(
          agentId, "bucket", `obj-${i}`, makeHash(ethers, `type-${i}`), BigInt(i), 100n
        );
        const asset = await vault.getDataAsset(BigInt(i + 1));
        assert.strictEqual(asset.dataType, BigInt(i));
      }
    });

    it("should revert if caller is not the agent owner", async function () {
      const { vault, ethers, user2, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "unauthorized");

      await assert.rejects(
        async () => {
          await vault.connect(user2).registerDataAsset(
            agentId, "bucket", "object", hash, 0n, 100n
          );
        },
        { message: /not authorized/ }
      );
    });

    it("should revert if agent is not in Active state", async function () {
      const { vault, registry, ethers, user1 } = await deployFixture();

      // Register agent but do NOT activate
      await registry.connect(user1).registerAgent("Agent", "d", "h", "e");
      const agentId = 1n;
      const hash = makeHash(ethers, "inactive");

      await assert.rejects(
        async () => {
          await vault.connect(user1).registerDataAsset(
            agentId, "bucket", "object", hash, 0n, 100n
          );
        },
        { message: /agent not active/ }
      );
    });

    it("should revert with empty bucket name", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "empty-bucket");

      await assert.rejects(
        async () => {
          await vault.connect(user1).registerDataAsset(
            agentId, "", "object", hash, 0n, 100n
          );
        },
        { message: /empty bucket/ }
      );
    });

    it("should revert with empty object name", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "empty-object");

      await assert.rejects(
        async () => {
          await vault.connect(user1).registerDataAsset(
            agentId, "bucket", "", hash, 0n, 100n
          );
        },
        { message: /empty object/ }
      );
    });

    it("should revert with zero content hash", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      await assert.rejects(
        async () => {
          await vault.connect(user1).registerDataAsset(
            agentId, "bucket", "object", ethers.ZeroHash, 0n, 100n
          );
        },
        { message: /zero hash/ }
      );
    });

    it("should revert with zero size", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "zero-size");

      await assert.rejects(
        async () => {
          await vault.connect(user1).registerDataAsset(
            agentId, "bucket", "object", hash, 0n, 0n
          );
        },
        { message: /zero size/ }
      );
    });

    it("should revert with duplicate content hash", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "duplicate");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", hash, 0n, 100n
      );

      await assert.rejects(
        async () => {
          await vault.connect(user1).registerDataAsset(
            agentId, "bucket", "obj2", hash, 1n, 200n
          );
        },
        { message: /duplicate hash/ }
      );
    });
  });

  // -- verifyAsset --

  describe("verifyAsset", function () {
    it("should allow verifier to verify an asset", async function () {
      const { vault, ethers, user1, verifier, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "verify-test");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await vault.connect(verifier).verifyAsset(1n);

      const asset = await vault.getDataAsset(1n);
      assert.strictEqual(asset.verified, true);
    });

    it("should allow contract owner to verify an asset", async function () {
      const { vault, ethers, user1, owner, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "owner-verify");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await vault.connect(owner).verifyAsset(1n);

      const asset = await vault.getDataAsset(1n);
      assert.strictEqual(asset.verified, true);
    });

    it("should emit DataAssetVerified event", async function () {
      const { vault, ethers, user1, verifier, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "verify-event");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      const tx = await vault.connect(verifier).verifyAsset(1n);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return vault.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "DataAssetVerified";
        } catch { return false; }
      });
      assert.ok(event, "DataAssetVerified event should be emitted");
    });

    it("should revert if caller is not verifier or owner", async function () {
      const { vault, ethers, user1, user2, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "unauth-verify");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await assert.rejects(
        async () => { await vault.connect(user2).verifyAsset(1n); },
        { message: /not authorized/ }
      );
    });

    it("should revert if asset is not active", async function () {
      const { vault, ethers, user1, verifier, owner, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "inactive-verify");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      // Deactivate first
      await vault.connect(owner).deactivateAsset(1n);

      await assert.rejects(
        async () => { await vault.connect(verifier).verifyAsset(1n); },
        { message: /asset not active/ }
      );
    });

    it("should revert if asset is already verified", async function () {
      const { vault, ethers, user1, verifier, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "double-verify");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await vault.connect(verifier).verifyAsset(1n);

      await assert.rejects(
        async () => { await vault.connect(verifier).verifyAsset(1n); },
        { message: /already verified/ }
      );
    });
  });

  // -- deactivateAsset --

  describe("deactivateAsset", function () {
    it("should allow agent owner to deactivate an asset", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "deactivate-owner");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await vault.connect(user1).deactivateAsset(1n);

      const asset = await vault.getDataAsset(1n);
      assert.strictEqual(asset.active, false);
    });

    it("should allow contract owner to deactivate an asset", async function () {
      const { vault, ethers, user1, owner, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "deactivate-contract-owner");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await vault.connect(owner).deactivateAsset(1n);

      const asset = await vault.getDataAsset(1n);
      assert.strictEqual(asset.active, false);
    });

    it("should emit DataAssetDeactivated event", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "deactivate-event");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      const tx = await vault.connect(user1).deactivateAsset(1n);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return vault.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "DataAssetDeactivated";
        } catch { return false; }
      });
      assert.ok(event, "DataAssetDeactivated event should be emitted");
    });

    it("should revert if caller is not agent owner or contract owner", async function () {
      const { vault, ethers, user1, user2, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "unauth-deactivate");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await assert.rejects(
        async () => { await vault.connect(user2).deactivateAsset(1n); },
        { message: /not authorized/ }
      );
    });

    it("should revert if asset is already deactivated", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "double-deactivate");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      await vault.connect(user1).deactivateAsset(1n);

      await assert.rejects(
        async () => { await vault.connect(user1).deactivateAsset(1n); },
        { message: /asset not active/ }
      );
    });
  });

  // -- setVerifier --

  describe("setVerifier", function () {
    it("should allow owner to set verifier", async function () {
      const { vault, owner, verifier } = await deployFixture();

      await vault.connect(owner).setVerifier(verifier.address);
      assert.strictEqual(await vault.verifierAddress(), verifier.address);
    });

    it("should emit VerifierSet event", async function () {
      const { vault, owner, verifier } = await deployFixture();

      const tx = await vault.connect(owner).setVerifier(verifier.address);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return vault.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "VerifierSet";
        } catch { return false; }
      });
      assert.ok(event, "VerifierSet event should be emitted");
    });

    it("should revert if caller is not owner", async function () {
      const { vault, user1, verifier } = await deployFixture();

      await assert.rejects(
        async () => { await vault.connect(user1).setVerifier(verifier.address); },
        { message: /OwnableUnauthorizedAccount/ }
      );
    });

    it("should revert if setting zero address", async function () {
      const { vault, ethers, owner } = await deployFixture();

      await assert.rejects(
        async () => { await vault.connect(owner).setVerifier(ethers.ZeroAddress); },
        { message: /zero verifier/ }
      );
    });
  });

  // -- View Functions --

  describe("view functions", function () {
    it("getAgentAssets should return correct asset IDs for an agent", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", makeHash(ethers, "view-1"), 0n, 100n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj2", makeHash(ethers, "view-2"), 1n, 200n
      );

      const assets = await vault.getAgentAssets(agentId);
      assert.strictEqual(assets.length, 2);
      assert.strictEqual(assets[0], 1n);
      assert.strictEqual(assets[1], 2n);
    });

    it("getAgentAssetCount should return correct count", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      assert.strictEqual(await vault.getAgentAssetCount(agentId), 0n);

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", makeHash(ethers, "count-1"), 0n, 100n
      );
      assert.strictEqual(await vault.getAgentAssetCount(agentId), 1n);

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj2", makeHash(ethers, "count-2"), 1n, 200n
      );
      assert.strictEqual(await vault.getAgentAssetCount(agentId), 2n);
    });

    it("getVerifiedAssetCount should only count verified and active assets", async function () {
      const { vault, ethers, user1, verifier, agentId } = await deployWithActiveAgentFixture();

      // Register 3 assets
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", makeHash(ethers, "verified-1"), 0n, 100n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj2", makeHash(ethers, "verified-2"), 1n, 200n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj3", makeHash(ethers, "verified-3"), 2n, 300n
      );

      // None verified yet
      assert.strictEqual(await vault.getVerifiedAssetCount(agentId), 0n);

      // Verify asset 1 and 2
      await vault.connect(verifier).verifyAsset(1n);
      await vault.connect(verifier).verifyAsset(2n);
      assert.strictEqual(await vault.getVerifiedAssetCount(agentId), 2n);

      // Deactivate asset 2 -> verified count should drop
      await vault.connect(user1).deactivateAsset(2n);
      assert.strictEqual(await vault.getVerifiedAssetCount(agentId), 1n);
    });

    it("getTotalDataSize should sum only active asset sizes", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", makeHash(ethers, "size-1"), 0n, 1000n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj2", makeHash(ethers, "size-2"), 1n, 2000n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj3", makeHash(ethers, "size-3"), 2n, 3000n
      );

      assert.strictEqual(await vault.getTotalDataSize(agentId), 6000n);

      // Deactivate asset 2 (size 2000)
      await vault.connect(user1).deactivateAsset(2n);
      assert.strictEqual(await vault.getTotalDataSize(agentId), 4000n);
    });

    it("getDataAsset should revert for non-existent asset", async function () {
      const { vault } = await deployFixture();

      await assert.rejects(
        async () => { await vault.getDataAsset(999n); },
        { message: /asset not found/ }
      );
    });

    it("getAgentAssets should return empty array for agent with no assets", async function () {
      const { vault, agentId } = await deployWithActiveAgentFixture();

      const assets = await vault.getAgentAssets(agentId);
      assert.strictEqual(assets.length, 0);
    });
  });

  // -- Multiple Agents and Assets --

  describe("multiple agents and assets", function () {
    it("should track assets separately for different agents", async function () {
      const { vault, registry, ethers, user1, user2, owner } = await deployFixture();

      // Register two agents
      await registry.connect(user1).registerAgent("Agent1", "d", "h", "e");
      await registry.connect(user2).registerAgent("Agent2", "d", "h", "e");
      await registry.connect(user1).updateState(1n, 1n);
      await registry.connect(user2).updateState(2n, 1n);

      // Set verifier
      await vault.connect(owner).setVerifier(owner.address);

      // Agent1 registers 2 assets
      await vault.connect(user1).registerDataAsset(
        1n, "bucket-a1", "obj1", makeHash(ethers, "multi-agent-1"), 0n, 100n
      );
      await vault.connect(user1).registerDataAsset(
        1n, "bucket-a1", "obj2", makeHash(ethers, "multi-agent-2"), 1n, 200n
      );

      // Agent2 registers 1 asset
      await vault.connect(user2).registerDataAsset(
        2n, "bucket-a2", "obj1", makeHash(ethers, "multi-agent-3"), 2n, 500n
      );

      assert.strictEqual(await vault.getAgentAssetCount(1n), 2n);
      assert.strictEqual(await vault.getAgentAssetCount(2n), 1n);

      assert.strictEqual(await vault.getTotalDataSize(1n), 300n);
      assert.strictEqual(await vault.getTotalDataSize(2n), 500n);

      // Verify one of agent1's assets
      await vault.connect(owner).verifyAsset(1n);
      assert.strictEqual(await vault.getVerifiedAssetCount(1n), 1n);
      assert.strictEqual(await vault.getVerifiedAssetCount(2n), 0n);
    });

    it("should prevent cross-agent hash reuse", async function () {
      const { vault, registry, ethers, user1, user2 } = await deployFixture();

      await registry.connect(user1).registerAgent("Agent1", "d", "h", "e");
      await registry.connect(user2).registerAgent("Agent2", "d", "h", "e");
      await registry.connect(user1).updateState(1n, 1n);
      await registry.connect(user2).updateState(2n, 1n);

      const sharedHash = makeHash(ethers, "shared-content");

      // Agent1 registers with the hash
      await vault.connect(user1).registerDataAsset(
        1n, "bucket", "obj", sharedHash, 0n, 100n
      );

      // Agent2 tries to use the same hash
      await assert.rejects(
        async () => {
          await vault.connect(user2).registerDataAsset(
            2n, "bucket", "obj", sharedHash, 0n, 100n
          );
        },
        { message: /duplicate hash/ }
      );
    });
  });

  // -- Edge Cases --

  describe("edge cases", function () {
    it("usedHashes mapping should be set after registration", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "used-hash-check");

      assert.strictEqual(await vault.usedHashes(hash), false);

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      assert.strictEqual(await vault.usedHashes(hash), true);
    });

    it("deactivated asset should not contribute to verified count even if verified before deactivation", async function () {
      const { vault, ethers, user1, verifier, agentId } = await deployWithActiveAgentFixture();
      const hash = makeHash(ethers, "verify-then-deactivate");

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "object", hash, 0n, 100n
      );

      // Verify then deactivate
      await vault.connect(verifier).verifyAsset(1n);
      assert.strictEqual(await vault.getVerifiedAssetCount(agentId), 1n);

      await vault.connect(user1).deactivateAsset(1n);
      assert.strictEqual(await vault.getVerifiedAssetCount(agentId), 0n);
    });

    it("getTotalDataSize should return 0 when all assets are deactivated", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", makeHash(ethers, "all-deactivated-1"), 0n, 500n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj2", makeHash(ethers, "all-deactivated-2"), 1n, 700n
      );

      await vault.connect(user1).deactivateAsset(1n);
      await vault.connect(user1).deactivateAsset(2n);

      assert.strictEqual(await vault.getTotalDataSize(agentId), 0n);
    });

    it("getAgentAssetCount should still count deactivated assets (total registered)", async function () {
      const { vault, ethers, user1, agentId } = await deployWithActiveAgentFixture();

      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj1", makeHash(ethers, "count-deactivated-1"), 0n, 100n
      );
      await vault.connect(user1).registerDataAsset(
        agentId, "bucket", "obj2", makeHash(ethers, "count-deactivated-2"), 1n, 200n
      );

      await vault.connect(user1).deactivateAsset(1n);

      // Count reflects all registered, not just active
      assert.strictEqual(await vault.getAgentAssetCount(agentId), 2n);
    });
  });
});
