import { getAddress } from "./address";
import { Wallet } from "@ethersproject/wallet";
import {
  Directive,
  TransactionRequest,
  serialize,
  UnsignedTransaction,
  StakingTransactionResponse,
  StakingTransactionRequest,
  TransactionResponse,
} from "./transactions";
import { HarmonyProvider } from "./provider";
import { resolveProperties, Deferrable, shallowCopy } from "@ethersproject/properties";
import { keccak256 } from "@ethersproject/keccak256";
import { parseUnits } from "@ethersproject/units";
import { Logger } from "@ethersproject/logger";
const logger = new Logger("hmy_wallet/0.0.1");

const allowedTransactionKeys: Array<string> = ["chainId", "data", "from", "gasLimit", "gasPrice", "nonce", "to", "type", "value", "msg"];

export default class HarmonyWallet extends Wallet {
  provider: HarmonyProvider;
  async getChainId(): Promise<number> {
    this._checkProvider("getChainId");
    const network = await this.provider.getNetwork();
    return network.chainId;
  }

  async populateTransaction(transaction: Deferrable<TransactionRequest>): Promise<TransactionRequest> {
    const tx: Deferrable<TransactionRequest> = await resolveProperties(this.checkTransaction(transaction));

    if (tx.type != null) {
      if (tx.gasPrice == null) {
        tx.gasPrice = parseUnits("100", 9);
      }

      if (tx.gasLimit == null) {
        if (tx.type === Directive.CreateValidator) {
          tx.gasLimit = parseUnits("5300000", 0).add(100000); // TODO: calculate using tx bytes;
        } else {
          tx.gasLimit = parseUnits("210000", 0);
        }
      }
    }

    return super.populateTransaction(tx);
  }

  async signTransaction(transaction: TransactionRequest): Promise<string> {
    const tx = await resolveProperties(transaction);
    if (tx.from != null) {
      if (getAddress(tx.from).checksum !== this.address) {
        logger.throwArgumentError("transaction from address mismatch", "transaction.from", transaction.from);
      }
      delete tx.from;
    }

    const signature = this._signingKey().signDigest(keccak256(serialize(<UnsignedTransaction>tx)));

    return serialize(<UnsignedTransaction>tx, signature);
  }

  checkTransaction(transaction: Deferrable<TransactionRequest>): Deferrable<TransactionRequest> {
    for (const key in transaction) {
      if (allowedTransactionKeys.indexOf(key) === -1) {
        logger.throwArgumentError("invalid transaction key: " + key, "transaction", transaction);
      }
    }

    const tx = shallowCopy(transaction);

    if (tx.from == null) {
      tx.from = this.getAddress();
    } else {
      // Make sure any provided address matches this signer
      tx.from = Promise.all([Promise.resolve(tx.from), this.getAddress()]).then((result) => {
        if (result[0].toLowerCase() !== result[1].toLowerCase()) {
          logger.throwArgumentError("from address mismatch", "transaction", transaction);
        }
        return result[0];
      });
    }

    return tx;
  }

  async sendTransaction(transaction: Deferrable<TransactionRequest>): Promise<TransactionResponse> {
    this._checkProvider("sendTransaction");
    const tx = await this.populateTransaction(transaction);
    const signedTx = await this.signTransaction(tx);
    return await this.provider.sendTransaction(signedTx);
  }

  // Populates all fields in a transaction, signs it and sends it to the network
  async sendStakingTransaction(transaction: Deferrable<StakingTransactionRequest>): Promise<StakingTransactionResponse> {
    this._checkProvider("sendStakingTransaction");
    const tx = await this.populateTransaction(transaction);
    const signedTx = await this.signTransaction(tx);
    return await this.provider.sendStakingTransaction(signedTx);
  }
}
