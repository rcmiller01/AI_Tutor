/**
 * apps/child-ui/src/components/rewards/StarsBurst.tsx
 *
 * Celebratory star burst animation when earning stars.
 */

import { useEffect, useState } from 'react';
import './StarsBurst.css';

interface StarsBurstProps {
    count: number;
}

interface Star {
    id: number;
    x: number;
    y: number;
    size: number;
    delay: number;
    rotation: number;
}

export function StarsBurst({ count }: StarsBurstProps) {
    const [stars, setStars] = useState<Star[]>([]);

    useEffect(() => {
        // Generate random star positions
        const newStars: Star[] = [];
        const starCount = Math.min(count * 3, 15); // 3 stars per point, max 15

        for (let i = 0; i < starCount; i++) {
            newStars.push({
                id: i,
                x: Math.random() * 200 - 100, // -100 to 100
                y: Math.random() * -150 - 50, // -50 to -200 (upward)
                size: 0.5 + Math.random() * 0.5, // 0.5 to 1
                delay: Math.random() * 0.3, // 0 to 0.3s
                rotation: Math.random() * 360,
            });
        }

        setStars(newStars);
    }, [count]);

    return (
        <div className="stars-burst">
            <div className="stars-count">+{count}</div>
            {stars.map((star) => (
                <div
                    key={star.id}
                    className="burst-star"
                    style={{
                        '--x': `${star.x}px`,
                        '--y': `${star.y}px`,
                        '--scale': star.size,
                        '--delay': `${star.delay}s`,
                        '--rotation': `${star.rotation}deg`,
                    } as React.CSSProperties}
                >
                    ⭐
                </div>
            ))}
        </div>
    );
}
