import torch
import torch.nn as nn

class StaticMLPEncoder(nn.Module):
    """Encodes 60-dimensional static EHR and clinical history features."""
    def __init__(self, input_dim: int = 60, output_dim: int = 64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, output_dim),
            nn.BatchNorm1d(output_dim),
            nn.ReLU()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class Conv1DDynamicEncoder(nn.Module):
    """Encodes 20-channel x 12-hour sliding window of continuous wearable & air-quality telemetry."""
    def __init__(self, in_channels: int = 20, output_dim: int = 128):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, 32, kernel_size=3, stride=1, padding=0)
        self.bn1 = nn.BatchNorm1d(32)
        self.relu1 = nn.ReLU()

        self.conv2 = nn.Conv1d(32, 64, kernel_size=3, stride=2, padding=1)
        self.bn2 = nn.BatchNorm1d(64)
        self.relu2 = nn.ReLU()

        self.conv3 = nn.Conv1d(64, output_dim, kernel_size=5, stride=1, padding=0)
        self.bn3 = nn.BatchNorm1d(output_dim)
        self.relu3 = nn.ReLU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Input shape: [batch, 20, 12]
        x = self.relu1(self.bn1(self.conv1(x)))  # -> [batch, 32, 10]
        x = self.relu2(self.bn2(self.conv2(x)))  # -> [batch, 64, 5]
        x = self.relu3(self.bn3(self.conv3(x)))  # -> [batch, 128, 1]
        return x.squeeze(-1)                      # -> [batch, 128]


class DigitalTwinFusionModel(nn.Module):
    """
    Multimodal Digital Twin Fusion Model
    Fuses static EHR features with dynamic wearable and environmental time series.
    Outputs:
      - 24h risk logit (BCE)
      - 48h risk logit (BCE)
      - Exacerbation severity class logits (Cross-Entropy, 4 classes)
    """
    def __init__(self, static_dim: int = 60, dynamic_channels: int = 20):
        super().__init__()
        self.static_encoder = StaticMLPEncoder(input_dim=static_dim, output_dim=64)
        self.dynamic_encoder = Conv1DDynamicEncoder(in_channels=dynamic_channels, output_dim=128)

        self.shared_head = nn.Sequential(
            nn.Linear(64 + 128, 64),
            nn.ReLU(),
            nn.Dropout(0.3)
        )

        self.out_24h = nn.Linear(64, 1)
        self.out_48h = nn.Linear(64, 1)
        self.out_severity = nn.Linear(64, 4)

    def forward(self, static_x: torch.Tensor, dynamic_x: torch.Tensor):
        emb_static = self.static_encoder(static_x)
        emb_dynamic = self.dynamic_encoder(dynamic_x)
        fused = torch.cat((emb_static, emb_dynamic), dim=1)

        h = self.shared_head(fused)
        logit_24h = self.out_24h(h).squeeze(-1)
        logit_48h = self.out_48h(h).squeeze(-1)
        logits_sev = self.out_severity(h)

        return logit_24h, logit_48h, logits_sev
