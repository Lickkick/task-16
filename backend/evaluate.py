"""Run holdout evaluation and print MAE."""

import json

from estimator import DeadlineEstimator


def main():
    estimator = DeadlineEstimator()
    results = estimator.evaluate_holdout()

    print("=" * 60)
    print("SmartDeadlineEstimator — Holdout Evaluation")
    print("=" * 60)
    print(f"Training tasks:  {results['training_count']}")
    print(f"Holdout tasks:   {results['holdout_count']}")
    print(f"Mean Absolute Error: {results['mean_absolute_error_days']} days")
    print()
    print("Per-task predictions:")
    print("-" * 60)
    for p in results["predictions"]:
        print(
            f"  [{p['id']:3d}] {p['title'][:45]:45s} "
            f"actual={p['actual_days']:5.1f}  pred={p['predicted_days']:5.1f}  "
            f"err={p['error_days']:4.1f}"
        )
    print()

    with open("evaluation_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("Full results saved to evaluation_results.json")


if __name__ == "__main__":
    main()
