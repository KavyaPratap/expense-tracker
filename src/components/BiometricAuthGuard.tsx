'use client';

import { useEffect, useState } from 'react';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Lock, FingerprintPattern, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function BiometricAuthGuard({ children }: { children: React.ReactNode }) {
    const [isLocked, setIsLocked] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [biometricType, setBiometricType] = useState<'fingerprint' | 'face' | 'iris' | 'other'>('other');

    useEffect(() => {
        checkBiometricSupport();
    }, []);

    const checkBiometricSupport = async () => {
        try {
            const result = await NativeBiometric.isAvailable();
            if (result.isAvailable) {
                setIsSupported(true);
                // quick mapping of biometric type
                // native-biometric wrapper usually returns string like "touchId", "faceId", "fingerprint"
                // but checking source might be needed. For now assume generic.

                // Check if user has enabled it
                const enabled = localStorage.getItem('biometric_enabled') === 'true';
                if (enabled) {
                    setIsLocked(true);
                    performBiometricAuth();
                }
            }
        } catch (error) {
            console.error("Biometric not available", error);
            setIsSupported(false);
        }
    };

    const performBiometricAuth = async () => {
        try {
            await NativeBiometric.verifyIdentity({
                reason: "Unlock SmartSpend",
                title: "Authentication Required",
                subtitle: "Confirm your identity to continue",
                description: "Use your fingerprint or face ID"
            });

            // If we get here, verification succeeded (plugin throws on failure)
            setIsLocked(false);
        } catch (error) {
            console.error("Authentication failed", error);
            toast.error("Authentication failed");
            // Keep locked
        }
    };

    if (isLocked) {
        return (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md">
                <div className="flex flex-col items-center space-y-8 p-8 max-w-sm text-center">
                    <div className="p-4 bg-primary/10 rounded-full animate-pulse">
                        <Lock className="w-12 h-12 text-primary" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight">SmartSpend Locked</h2>
                        <p className="text-muted-foreground">Authentication required to access your finances.</p>
                    </div>

                    <Button
                        size="lg"
                        onClick={performBiometricAuth}
                        className="w-full gap-2 transition-all active:scale-95"
                    >
                        <FingerprintPattern className="w-5 h-5" />
                        Verify Identity
                    </Button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
