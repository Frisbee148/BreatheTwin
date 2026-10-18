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


class TCNBlock(nn.Module):
    """Temporal Convolutional Block with dilated convolutions for multi-scale temporal receptive fields."""
    def __init__(self, in_channels: int, out_channels: int, kernel_size: int = 3, dilation: int = 1, dropout: float = 0.2):
        super().__init__()
        padding = (kernel_size - 1) * dilation
        self.conv = nn.Conv1d(in_channels, out_channels, kernel_size, dilation=dilation, padding=padding)
        self.bn = nn.BatchNorm1d(out_channels)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.dropout(self.relu(self.bn(self.conv(x))))


class Conv1DDynamicEncoder(nn.Module):
    """Encodes multi-channel sliding window of continuous wearable & air-quality telemetry via dilated TCN blocks."""
    def __init__(self, in_channels: int = 20, output_dim: int = 128):
        super().__init__()
        self.tcn_block1 = TCNBlock(in_channels, 32, kernel_size=3, dilation=1)
        self.tcn_block2 = TCNBlock(32, 64, kernel_size=3, dilation=2)
        self.tcn_block3 = TCNBlock(64, output_dim, kernel_size=3, dilation=4)
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.post_pool = nn.Linear(output_dim, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Input shape: [batch, channels, time_steps]
        x = self.tcn_block1(x)
        x = self.tcn_block2(x)
        x = self.tcn_block3(x)
        x = self.global_pool(x).squeeze(-1)
        return self.post_pool(x)


class DigitalTwinFusionModel(nn.Module):
    """
    Multimodal Digital Twin Dilated-TCN Fusion Model
    Fuses static EHR features with dynamic wearable and environmental time series.
    Outputs:
      - 24h risk logit (BCE)
      - 48h risk logit (BCE)
      - Exacerbation severity class logits (Cross-Entropy, 4 classes)
    """
    def __init__(self, static_dim: int = 60, dynamic_channels: int = 20):
        super().__init__()
        self.static_dim = static_dim
        self.dynamic_channels = dynamic_channels
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

