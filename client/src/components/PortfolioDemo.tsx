import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Download, Monitor, Sparkles } from 'lucide-react';
import { RigExporter, type RigExportSchema } from '../utils/rigExporter';
import { usePerformanceTracker } from '../hooks/usePerformanceTracker';

interface PortfolioDemoProps {
  state: any; // SkeletonState - using any for simplicity
  onExportRig?: (rig: RigExportSchema) => void;
}

export const PortfolioDemo: React.FC<PortfolioDemoProps> = ({ 
  state, 
  onExportRig 
}) => {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [currentDemo, setCurrentDemo] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [showMetrics, setShowMetrics] = useState(true);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  
  const tracker = usePerformanceTracker();

  const demos = [
    {
      name: 'Feathery Physics',
      description: 'Demonstrates tactile, damped angular springs',
      duration: 5000,
      setup: () => {
        // Setup for feathery physics demo
        console.log('Setting up feathery physics demo');
      },
      cleanup: () => {
        console.log('Cleaning up feathery physics demo');
      }
    },
    {
      name: 'Analog Simulation',
      description: 'Cardboard cutout aesthetics with weight simulation',
      duration: 5000,
      setup: () => {
        console.log('Setting up analog simulation demo');
      },
      cleanup: () => {
        console.log('Cleaning up analog simulation demo');
      }
    },
    {
      name: 'Cave Art Rigging',
      description: 'Direct manipulation with silhouette binding',
      duration: 5000,
      setup: () => {
        console.log('Setting up cave art rigging demo');
      },
      cleanup: () => {
        console.log('Cleaning up cave art rigging demo');
      }
    }
  ];

  const startDemo = useCallback(() => {
    setIsDemoMode(true);
    setIsPlaying(true);
    setDemoProgress(0);
    tracker.start();
    
    const currentDemoConfig = demos[currentDemo];
    currentDemoConfig.setup();
    
    // Simulate demo progress
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / currentDemoConfig.duration, 1);
      
      setDemoProgress(progress);
      
      // Collect performance data
      const metrics = tracker.getMetrics();
      setPerformanceData(prev => [...prev, {
        timestamp: Date.now(),
        demo: currentDemoConfig.name,
        ...metrics
      }]);
      
      if (progress >= 1) {
        clearInterval(progressInterval);
        setIsPlaying(false);
        currentDemoConfig.cleanup();
      }
    }, 100);
    
    return () => {
      clearInterval(progressInterval);
      currentDemoConfig.cleanup();
    };
  }, [currentDemo, tracker]);

  const stopDemo = useCallback(() => {
    setIsPlaying(false);
    tracker.stop();
    demos[currentDemo].cleanup();
  }, [currentDemo, tracker]);

  const nextDemo = useCallback(() => {
    stopDemo();
    setCurrentDemo((prev) => (prev + 1) % demos.length);
    setDemoProgress(0);
  }, [stopDemo]);

  const resetDemo = useCallback(() => {
    stopDemo();
    setDemoProgress(0);
    setPerformanceData([]);
  }, [stopDemo]);

  const exportRig = useCallback(() => {
    const rig = RigExporter.exportRig(state, {
      name: 'Bitruvius Portfolio Demo',
      description: 'Creative Systems Engineering - Analog Simulation Kinematics',
      author: 'Portfolio Demo'
    });
    
    RigExporter.downloadRig(rig, 'bitruvius_portfolio_demo.json');
    onExportRig?.(rig);
  }, [state, onExportRig]);

  const exportPerformanceData = useCallback(() => {
    const data = {
      metadata: {
        name: 'Bitruvius Performance Analysis',
        createdAt: new Date().toISOString(),
        totalDemos: demos.length,
        totalSamples: performanceData.length
      },
      demos: demos.map((demo, index) => ({
        ...demo,
        samples: performanceData.filter(p => p.demo === demo.name)
      })),
      summary: {
        averageFps: performanceData.reduce((sum, p) => sum + p.fps, 0) / performanceData.length || 0,
        totalDrops: performanceData.reduce((sum, p) => sum + p.dropCount, 0),
        optimalFrames: performanceData.filter(p => p.isOptimal).length
      }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bitruvius_performance_analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [performanceData, demos]);

  const currentMetrics = tracker.getMetrics();

  if (!isDemoMode) {
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setIsDemoMode(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-sm transition-all"
        >
          <Sparkles size={16} />
          Portfolio Demo
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Bitruvius: Portfolio Demo
            </h1>
            <p className="text-white/60">
              Analog Simulation Kinematics - Creative Systems Engineering
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Performance Toggle */}
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                showMetrics 
                  ? 'bg-white/20 text-white' 
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              <Monitor size={14} />
              <span className="text-xs">Metrics</span>
            </button>
            
            {/* Export Controls */}
            <button
              onClick={exportRig}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-all"
            >
              <Download size={14} />
              Export Rig
            </button>
            
            <button
              onClick={exportPerformanceData}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all"
            >
              <Download size={14} />
              Export Data
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Demo Controls */}
          <div className="w-80 border-r border-white/10 p-6 space-y-6">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-4">
                Demo Sequence
              </h2>
              
              {/* Demo Selector */}
              <div className="space-y-2">
                {demos.map((demo, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      stopDemo();
                      setCurrentDemo(index);
                      setDemoProgress(0);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      index === currentDemo
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                    }`}
                  >
                    <div className="font-medium text-sm">{demo.name}</div>
                    <div className="text-xs text-white/40 mt-1">{demo.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Playback Controls */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-4">
                Playback
              </h3>
              
              <div className="flex gap-2 mb-4">
                <button
                  onClick={isPlaying ? stopDemo : startDemo}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all"
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                
                <button
                  onClick={resetDemo}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
                
                <button
                  onClick={nextDemo}
                  disabled={isPlaying}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all disabled:opacity-40"
                >
                  Next
                </button>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-white/40">Progress</span>
                  <span className="text-white/60">{Math.round(demoProgress * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-400 transition-all duration-100"
                    style={{ width: `${demoProgress * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Current Demo Info */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-4">
                Current: {demos[currentDemo].name}
              </h3>
              <p className="text-sm text-white/60">
                {demos[currentDemo].description}
              </p>
            </div>
          </div>

          {/* Demo Area */}
          <div className="flex-1 relative">
            {/* This would contain your actual demo visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">🎭</div>
                <h2 className="text-3xl font-bold text-white mb-2">
                  {demos[currentDemo].name}
                </h2>
                <p className="text-white/60 mb-8">
                  {demos[currentDemo].description}
                </p>
                
                {isPlaying && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-400 text-sm">Demo Running</span>
                  </div>
                )}
              </div>
            </div>

            {/* Performance Overlay */}
            {showMetrics && (
              <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-3">
                  Performance Metrics
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-white/40">FPS</div>
                    <div className="font-mono text-lg text-green-400">{currentMetrics.fps}</div>
                  </div>
                  <div>
                    <div className="text-white/40">Avg FPS</div>
                    <div className="font-mono text-lg">{currentMetrics.averageFps}</div>
                  </div>
                  <div>
                    <div className="text-white/40">Frame Time</div>
                    <div className="font-mono">{currentMetrics.frameTime}ms</div>
                  </div>
                  <div>
                    <div className="text-white/40">Drops</div>
                    <div className="font-mono">{currentMetrics.dropCount}</div>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/40">Performance</span>
                    <span className="text-green-400">{Math.round((currentMetrics.averageFps / 60) * 100)}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-400 transition-all duration-300"
                      style={{ width: `${Math.min(100, (currentMetrics.averageFps / 60) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
