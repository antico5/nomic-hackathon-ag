const { buildModule } = require("@ignored/hardhat-ignition");

const TWO_MONTHS = 2 * 30 * 24 * 60 * 60;
const ONE_MONTH = 1 * 30 * 24 * 60 * 60;

module.exports = buildModule("HeirWalletModule", (m) => {
  const inactivityThreshold = m.getParam("inactivityThreshold");
  const vetoThreshold = m.getParam("vetoThreshold");

  const heirWallet = m.contract("HeirWallet", {
    args: [inactivityThreshold, vetoThreshold],
  });

  return { heirWallet };
});
