"""
SIB zkML: Train a Sharpe Ratio Estimator model and export to ONNX.

Input:  30 normalized daily returns
Output: normalized Sharpe ratio

The model learns to estimate Sharpe = mean(returns) / std(returns) * sqrt(252)
from raw daily returns. After training, it exports:
  - sharpe_model.onnx    (for EZKL circuit compilation)
  - norm_params.json     (normalization parameters for inference)
  - input.json           (sample input for proof generation)
"""

import json
import math
import os

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset


class SharpeEstimator(nn.Module):
    """Simple MLP that estimates Sharpe ratio from 30 daily returns."""

    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(30, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def compute_sharpe(returns: np.ndarray) -> float:
    """Annualized Sharpe ratio from daily returns."""
    mean_r = np.mean(returns)
    std_r = np.std(returns)
    if std_r < 1e-8:
        return 0.0
    return float(mean_r / std_r * math.sqrt(252))


def generate_dataset(n_samples: int = 10000, window: int = 30):
    """Generate synthetic daily-return windows and their Sharpe ratios."""
    X = []
    y = []
    for _ in range(n_samples):
        # Random mean and volatility for each sample
        mu = np.random.uniform(-0.005, 0.01)
        sigma = np.random.uniform(0.005, 0.05)
        returns = np.random.normal(mu, sigma, window).astype(np.float32)
        sharpe = compute_sharpe(returns)
        X.append(returns)
        y.append(sharpe)
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    device = torch.device("cpu")

    print("Generating training data...")
    X_train, y_train = generate_dataset(n_samples=20000)

    # Normalize inputs
    x_mean = X_train.mean(axis=0)
    x_std = X_train.std(axis=0) + 1e-8

    # Normalize outputs
    y_mean = y_train.mean()
    y_std = y_train.std() + 1e-8

    X_norm = (X_train - x_mean) / x_std
    y_norm = (y_train - y_mean) / y_std

    # Save normalization params
    norm_params = {
        "x_mean": x_mean.tolist(),
        "x_std": x_std.tolist(),
        "y_mean": float(y_mean),
        "y_std": float(y_std),
    }
    with open(os.path.join(out_dir, "norm_params.json"), "w") as f:
        json.dump(norm_params, f, indent=2)
    print("Saved norm_params.json")

    # PyTorch datasets
    dataset = TensorDataset(
        torch.from_numpy(X_norm),
        torch.from_numpy(y_norm).unsqueeze(1),
    )
    loader = DataLoader(dataset, batch_size=256, shuffle=True)

    # Train
    model = SharpeEstimator().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.MSELoss()

    print("Training...")
    for epoch in range(50):
        total_loss = 0.0
        for xb, yb in loader:
            xb, yb = xb.to(device), yb.to(device)
            pred = model(xb)
            loss = loss_fn(pred, yb)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * xb.size(0)
        avg_loss = total_loss / len(dataset)
        if (epoch + 1) % 10 == 0:
            print(f"  Epoch {epoch + 1}/50  loss={avg_loss:.6f}")

    # Export ONNX
    model.eval()
    dummy = torch.randn(1, 30)
    onnx_path = os.path.join(out_dir, "sharpe_model.onnx")
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["daily_returns"],
        output_names=["sharpe_ratio"],
        dynamic_axes=None,
        opset_version=13,
        dynamo=False,
    )
    print(f"Exported ONNX model: {onnx_path}")

    # Generate sample input for proof
    sample_returns = np.random.normal(0.003, 0.02, 30).astype(np.float32)
    sample_norm = ((sample_returns - x_mean) / x_std).tolist()

    input_data = {"input_data": [sample_norm]}
    with open(os.path.join(out_dir, "input.json"), "w") as f:
        json.dump(input_data, f, indent=2)
    print("Saved input.json (sample proof input)")

    # Verify model output
    with torch.no_grad():
        sample_tensor = torch.tensor([sample_norm], dtype=torch.float32)
        pred_norm = model(sample_tensor).item()
        pred_sharpe = pred_norm * y_std + y_mean
        actual_sharpe = compute_sharpe(sample_returns)
        print(f"\nVerification:")
        print(f"  Predicted Sharpe: {pred_sharpe:.4f}")
        print(f"  Actual Sharpe:    {actual_sharpe:.4f}")


if __name__ == "__main__":
    main()
