import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("TokenRegistry", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, user1] = await ethers.getSigners();
    const TokenRegistry = await ethers.getContractFactory("TokenRegistry");
    const registry = await TokenRegistry.deploy(owner.address);
    return { registry, ethers, owner, user1 };
  }

  // Mock ERC-20 address for testing (just use a random address)
  const MOCK_TOKEN = "0x0000000000000000000000000000000000000001";
  const MOCK_TOKEN_2 = "0x0000000000000000000000000000000000000002";

  // -- Deployment Tests --

  describe("deployment", function () {
    it("should pre-register BNB at address(0)", async function () {
      const { registry, ethers } = await deployFixture();

      const info = await registry.getTokenInfo(ethers.ZeroAddress);
      assert.strictEqual(info.symbol, "BNB");
      assert.strictEqual(info.decimals, 18n);
      assert.strictEqual(info.priceUsd, 300n * 10n ** 18n);
      assert.strictEqual(info.isActive, true);
      assert.ok(info.addedAt > 0n);
    });

    it("should set owner correctly", async function () {
      const { registry, owner } = await deployFixture();

      assert.strictEqual(await registry.owner(), owner.address);
    });

    it("should include BNB in getAllTokens", async function () {
      const { registry, ethers } = await deployFixture();

      const tokens = await registry.getAllTokens();
      assert.strictEqual(tokens.length, 1);
      assert.strictEqual(tokens[0], ethers.ZeroAddress);
    });
  });

  // -- addToken Tests --

  describe("addToken", function () {
    it("should add a new token successfully", async function () {
      const { registry, owner } = await deployFixture();

      await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);

      const info = await registry.getTokenInfo(MOCK_TOKEN);
      assert.strictEqual(info.symbol, "USDT");
      assert.strictEqual(info.decimals, 18n);
      assert.strictEqual(info.priceUsd, 1n * 10n ** 18n);
      assert.strictEqual(info.isActive, true);
    });

    it("should emit TokenAdded event", async function () {
      const { registry, owner } = await deployFixture();

      const tx = await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "TokenAdded";
        } catch { return false; }
      });
      assert.ok(event, "TokenAdded event should be emitted");
    });

    it("should revert for duplicate active token", async function () {
      const { registry, owner } = await deployFixture();

      await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);

      await assert.rejects(
        async () => { await registry.connect(owner).addToken(MOCK_TOKEN, "USDT2", 18, 2n * 10n ** 18n); },
        { message: /token already active/ }
      );
    });

    it("should revert if not owner", async function () {
      const { registry, user1 } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(user1).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n); },
        { message: /OwnableUnauthorizedAccount/ }
      );
    });

    it("should revert for address(0)", async function () {
      const { registry, ethers, owner } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(owner).addToken(ethers.ZeroAddress, "BNB2", 18, 300n * 10n ** 18n); },
        { message: /use constructor for BNB/ }
      );
    });
  });

  // -- removeToken Tests --

  describe("removeToken", function () {
    it("should remove a token successfully", async function () {
      const { registry, owner } = await deployFixture();

      await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);
      await registry.connect(owner).removeToken(MOCK_TOKEN);

      assert.strictEqual(await registry.isTokenSupported(MOCK_TOKEN), false);
    });

    it("should emit TokenRemoved event", async function () {
      const { registry, owner } = await deployFixture();

      await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);
      const tx = await registry.connect(owner).removeToken(MOCK_TOKEN);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "TokenRemoved";
        } catch { return false; }
      });
      assert.ok(event, "TokenRemoved event should be emitted");
    });

    it("should revert when trying to remove BNB", async function () {
      const { registry, ethers, owner } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(owner).removeToken(ethers.ZeroAddress); },
        { message: /cannot remove BNB/ }
      );
    });

    it("should revert if not owner", async function () {
      const { registry, owner, user1 } = await deployFixture();

      await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);

      await assert.rejects(
        async () => { await registry.connect(user1).removeToken(MOCK_TOKEN); },
        { message: /OwnableUnauthorizedAccount/ }
      );
    });
  });

  // -- updatePrice Tests --

  describe("updatePrice", function () {
    it("should update price for active token", async function () {
      const { registry, ethers, owner } = await deployFixture();

      const newPrice = 350n * 10n ** 18n;
      await registry.connect(owner).updatePrice(ethers.ZeroAddress, newPrice);

      assert.strictEqual(await registry.getTokenPrice(ethers.ZeroAddress), newPrice);
    });

    it("should emit TokenPriceUpdated event", async function () {
      const { registry, ethers, owner } = await deployFixture();

      const tx = await registry.connect(owner).updatePrice(ethers.ZeroAddress, 400n * 10n ** 18n);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "TokenPriceUpdated";
        } catch { return false; }
      });
      assert.ok(event, "TokenPriceUpdated event should be emitted");
    });

    it("should revert for inactive token", async function () {
      const { registry, owner } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(owner).updatePrice(MOCK_TOKEN, 1n * 10n ** 18n); },
        { message: /token not active/ }
      );
    });

    it("should revert if not owner", async function () {
      const { registry, ethers, user1 } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(user1).updatePrice(ethers.ZeroAddress, 400n * 10n ** 18n); },
        { message: /OwnableUnauthorizedAccount/ }
      );
    });
  });

  // -- View Function Tests --

  describe("view functions", function () {
    it("should return true for supported BNB", async function () {
      const { registry, ethers } = await deployFixture();

      assert.strictEqual(await registry.isTokenSupported(ethers.ZeroAddress), true);
    });

    it("should return true after addToken, false after removeToken", async function () {
      const { registry, owner } = await deployFixture();

      assert.strictEqual(await registry.isTokenSupported(MOCK_TOKEN), false);

      await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);
      assert.strictEqual(await registry.isTokenSupported(MOCK_TOKEN), true);

      await registry.connect(owner).removeToken(MOCK_TOKEN);
      assert.strictEqual(await registry.isTokenSupported(MOCK_TOKEN), false);
    });

    it("should return correct token info fields", async function () {
      const { registry, owner } = await deployFixture();

      await registry.connect(owner).addToken(MOCK_TOKEN, "WBTC", 8, 60000n * 10n ** 18n);

      const info = await registry.getTokenInfo(MOCK_TOKEN);
      assert.strictEqual(info.symbol, "WBTC");
      assert.strictEqual(info.decimals, 8n);
      assert.strictEqual(info.priceUsd, 60000n * 10n ** 18n);
      assert.strictEqual(info.isActive, true);
    });

    it("should grow getAllTokens on add", async function () {
      const { registry, owner } = await deployFixture();

      let tokens = await registry.getAllTokens();
      assert.strictEqual(tokens.length, 1); // BNB only

      await registry.connect(owner).addToken(MOCK_TOKEN, "USDT", 18, 1n * 10n ** 18n);
      tokens = await registry.getAllTokens();
      assert.strictEqual(tokens.length, 2);

      await registry.connect(owner).addToken(MOCK_TOKEN_2, "WBTC", 8, 60000n * 10n ** 18n);
      tokens = await registry.getAllTokens();
      assert.strictEqual(tokens.length, 3);
    });

    it("should return correct price via getTokenPrice", async function () {
      const { registry, ethers } = await deployFixture();

      const price = await registry.getTokenPrice(ethers.ZeroAddress);
      assert.strictEqual(price, 300n * 10n ** 18n);
    });

    it("should revert getTokenPrice for inactive token", async function () {
      const { registry } = await deployFixture();

      await assert.rejects(
        async () => { await registry.getTokenPrice(MOCK_TOKEN); },
        { message: /token not active/ }
      );
    });
  });
});
