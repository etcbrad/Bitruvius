import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { MiniSlider } from './MiniSlider';
import { Button } from './ui/button';
import { Card } from './ui/card';
import type { BalancedNeckConfig } from '../engine/balancedNeck';
import { DEFAULT_BALANCED_NECK_CONFIG, FLOATING_PIVOT_CONFIG } from '../engine/balancedNeck';

interface BalancedNeckControlsProps {
  config?: BalancedNeckConfig;
  onConfigChange: (config: BalancedNeckConfig) => void;
  clavicleConstraintEnabled?: boolean;
  onClavicleConstraintChange?: (enabled: boolean) => void;
}

export const BalancedNeckControls: React.FC<BalancedNeckControlsProps> = ({
  config = DEFAULT_BALANCED_NECK_CONFIG,
  onConfigChange,
  clavicleConstraintEnabled = false,
  onClavicleConstraintChange,
}) => {
  const updateConfig = (updates: Partial<BalancedNeckConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const updateRotationInheritance = (updates: Partial<BalancedNeckConfig['rotationInheritance']>) => {
    onConfigChange({
      ...config,
      rotationInheritance: { ...config.rotationInheritance, ...updates },
    });
  };

  const resetToDefaults = () => {
    onConfigChange({
      enabled: true,
      clavicleInfluence: 0.7,
      torsoInfluence: 0.3,
      followStrength: 0.8,
      smoothingFactor: 0.15,
      rotationInheritance: {
        enabled: true,
        torsoInfluence: 0.5,
        lagFactor: 0.3,
      },
    });
  };

  const applyFloatingPivot = () => {
    onConfigChange(FLOATING_PIVOT_CONFIG);
    if (onClavicleConstraintChange) {
      onClavicleConstraintChange(true); // Enable clavicle clamp
    }
  };

  const applyBalanced = () => {
    onConfigChange(DEFAULT_BALANCED_NECK_CONFIG);
    if (onClavicleConstraintChange) {
      onClavicleConstraintChange(false); // Disable clavicle clamp
    }
  };

  return (
    <CollapsibleSection title="🎯 Balanced Neck" defaultOpen={false}>
      <Card className="p-4 space-y-4">
        {/* Main Enable Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Enable Balanced Neck</span>
          <Button
            variant={config.enabled ? "default" : "outline"}
            size="sm"
            onClick={() => updateConfig({ enabled: !config.enabled })}
          >
            {config.enabled ? "ON" : "OFF"}
          </Button>
        </div>

        {config.enabled && (
          <>
            {/* Position Controls */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Position Balance</h4>
              
              <MiniSlider
                label="Clavicle Influence"
                value={config.clavicleInfluence}
                onChange={(value) => updateConfig({ clavicleInfluence: value })}
                min={0}
                max={1}
                step={0.05}
              />

              <MiniSlider
                label="Torso Influence"
                value={config.torsoInfluence}
                onChange={(value) => updateConfig({ torsoInfluence: value })}
                min={0}
                max={1}
                step={0.05}
              />

              <MiniSlider
                label="Follow Strength"
                value={config.followStrength}
                onChange={(value) => updateConfig({ followStrength: value })}
                min={0}
                max={1}
                step={0.05}
              />

              <MiniSlider
                label="Smoothing"
                value={config.smoothingFactor}
                onChange={(value) => updateConfig({ smoothingFactor: value })}
                min={0}
                max={1}
                step={0.05}
              />
            </div>

            {/* Rotation Controls */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Rotation Inheritance</h4>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Enable Rotation</span>
                <Button
                  variant={config.rotationInheritance.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateRotationInheritance({ enabled: !config.rotationInheritance.enabled })}
                >
                  {config.rotationInheritance.enabled ? "ON" : "OFF"}
                </Button>
              </div>

              {config.rotationInheritance.enabled && (
                <>
                  <MiniSlider
                    label="Torso Rotation Influence"
                    value={config.rotationInheritance.torsoInfluence}
                    onChange={(value) => updateRotationInheritance({ torsoInfluence: value })}
                    min={0}
                    max={1}
                    step={0.05}
                  />

                  <MiniSlider
                    label="Lag Factor"
                    value={config.rotationInheritance.lagFactor}
                    onChange={(value) => updateRotationInheritance({ lagFactor: value })}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </>
              )}
            </div>

            {/* Reset Button */}
            <div className="pt-2 border-t space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetToDefaults}
                className="w-full"
              >
                Reset to Defaults
              </Button>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyBalanced}
                  className="w-full text-xs"
                >
                  Balanced
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyFloatingPivot}
                  className="w-full text-xs"
                >
                  Floating Pivot
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </CollapsibleSection>
  );
};
