import type { Env, ReviewMessage } from "../types.js";
import { analyzePackage } from "./analyze.js";
import {
  insertReview,
  updateReview,
  updateVersionStatus,
} from "../db/queries.js";

const AUTO_APPROVE_THRESHOLD = 0.2;
const AUTO_REJECT_THRESHOLD = 0.85;

export async function handleReviewQueue(
  batch: MessageBatch<ReviewMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processReview(env, msg.body);
      msg.ack();
    } catch (err) {
      console.error(
        `Review failed: ${msg.body.packageName}@${msg.body.version}`,
        err,
      );
      msg.retry();
    }
  }
}

export async function processReviewInline(env: Env, message: ReviewMessage) {
  return processReview(env, message);
}

async function processReview(env: Env, message: ReviewMessage) {
  const reviewId = crypto.randomUUID();

  await insertReview(env.DB, {
    id: reviewId,
    packageVersionId: message.packageVersionId,
    reviewerType: "ai",
    status: "in_progress",
  });

  const result = await analyzePackage(
    env,
    message.packageName,
    message.version,
  );

  let reviewStatus: string;
  let versionStatus: string;

  if (result.riskScore <= AUTO_APPROVE_THRESHOLD) {
    reviewStatus = "approved";
    versionStatus = "approved";
  } else if (result.riskScore >= AUTO_REJECT_THRESHOLD) {
    reviewStatus = "rejected";
    versionStatus = "rejected";
  } else {
    reviewStatus = "needs_human_review";
    versionStatus = "under_review";
  }

  await updateReview(env.DB, reviewId, {
    status: reviewStatus,
    riskScore: result.riskScore,
    findings: JSON.stringify(result.findings),
    summary: result.summary,
  });

  await updateVersionStatus(env.DB, message.packageVersionId, versionStatus);

  console.log(
    `[review] ${message.packageName}@${message.version} → ${reviewStatus} (risk: ${result.riskScore.toFixed(2)})`,
  );
}
