import Phaser from 'phaser';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

class StartScene extends Phaser.Scene {
    constructor() {
        super('StartScene');
    }

    create() {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor('#000000');

        this.add.text(width / 2, height * 0.3, 'WHEN PIGS FLY', {
            fontSize: '32px',
            fontFamily: '"Press Start 2P"',
            fill: '#ffffff',
            align: 'center',
            wordWrap: { width: width * 0.8 }
        }).setOrigin(0.5);

        const btnX = width / 2;
        const btnY = height * 0.6;
        const bg = this.add.rectangle(btnX, btnY, 260, 70, 0xffffff);
        this.add.text(btnX, btnY, 'START RUN', {
            fontSize: '24px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#000000'
        }).setOrigin(0.5);
        
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this.scene.start('GameScene'));
    }
}

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    updateLaunchAngle(pointer) {
        let angle = Phaser.Math.Angle.Between(this.launchLine.x, this.launchLine.y, pointer.x, pointer.y);
        const minAngle = Phaser.Math.DegToRad(-85);
        const maxAngle = Phaser.Math.DegToRad(-10);
        angle = Phaser.Math.Clamp(angle, minAngle, maxAngle);
        this.launchLine.rotation = angle;
    }

    launchCharacter() {
        this.gameState = 'FLYING';
        this.powerBar.setVisible(false);
        this.powerIndicator.setVisible(false);
        
        // Show Glide Meter
        this.glideBar.setVisible(true);
        this.glideIndicator.setVisible(true);
        this.glideNote.setVisible(true);

        const { width, height } = this.scale;
        const targetZoom = 0.75;

        // Calculate Target Offset for 30% from Left
        // Offset = (TargetPercent - 0.5) * Width / Zoom
        const targetOffsetX = (-0.2 * width) / targetZoom;
        const targetOffsetY = height * 0.1;

        // Synchronized zoom and anchor transition
        this.tweens.add({
            targets: this.cameras.main,
            zoom: targetZoom,
            duration: 1500,
            ease: 'Quad.easeOut'
        });

        this.tweens.add({
            targets: this.cameras.main.followOffset,
            x: targetOffsetX,
            y: targetOffsetY,
            duration: 1500,
            ease: 'Quad.easeOut'
        });

        const minSpeed = 400;
        const maxSpeed = 1500;
        const launchSpeed = minSpeed + (maxSpeed - minSpeed) * this.powerLevel;
        const angle = this.launchLine.rotation;

        this.player.body.setAllowGravity(true);
        this.player.body.setVelocity(Math.cos(angle) * launchSpeed, Math.sin(angle) * launchSpeed);
        this.player.body.setBounce(0.4);
        this.player.body.setDragX(50); 
        
        // Use high horizontal lerp to ensure strict anchoring during high speeds
        this.cameras.main.setLerp(1, 0.1);
    }

    glideBoost() {
        if (this.glideLevel >= this.glideConsumption) {
            this.glideLevel -= this.glideConsumption;
            if (this.player.body.velocity.y > 0) {
                this.player.body.setVelocityY(this.player.body.velocity.y * 0.1);
            }
            this.player.body.velocity.y -= 400;
            if (this.player.body.velocity.y < -600) {
                this.player.body.setVelocityY(-600);
            }
        }
    }

    spawnCollectible() {
        const { width, height } = this.scale;
        const zoom = this.cameras.main.zoom;
        const visibleWidth = width / zoom;
        const visibleHeight = height / zoom;

        const spawnX = this.cameras.main.scrollX + visibleWidth + (100 / zoom);
        const groundHeight = height * 0.1;
        
        // Use camera's current vertical position to spawn items in the visible area
        const minY = this.cameras.main.scrollY - (50 / zoom);
        const maxY = this.cameras.main.scrollY + visibleHeight - groundHeight + (50 / zoom);
        const spawnY = Phaser.Math.Between(minY, maxY);
        
        // Ensure we don't spawn items below the ground
        const safeSpawnY = Math.min(spawnY, height - groundHeight - 20);
        
        // 20% chance to spawn a star power-up instead of a color square
        if (Phaser.Math.FloatBetween(0, 1) < 0.2) {
            const star = this.add.star(spawnX, safeSpawnY, 5, 15, 30, 0x00ffff);
            this.stars.add(star);
            star.body.setAllowGravity(false);
            
            // Ensure UI camera ignores this new star
            if (this.uiCam) this.uiCam.ignore(star);
            
            this.tweens.add({
                targets: star,
                angle: 360,
                duration: 3000,
                repeat: -1
            });
        } else {
            const color = Phaser.Math.RND.pick(this.collectibleColors);
            const item = this.add.rectangle(spawnX, safeSpawnY, 30, 30, color);
            this.collectibles.add(item);
            item.body.setAllowGravity(false);
            
            // Ensure UI camera ignores this new collectible
            if (this.uiCam) this.uiCam.ignore(item);
        }
    }

    spawnSign(distance) {
        const { height } = this.scale;
        const groundHeight = height * 0.1;
        // Increased sign height to 15% of screen height (original 5% + 10% increase)
        const signHeight = height * 0.15;
        const x = this.startX + (distance * 10);
        const y = height - groundHeight;
        
        const sign = this.add.container(x, y);
        // Scaled up post and board dimensions
        const post = this.add.rectangle(0, -signHeight / 2, 10, signHeight, 0x8B4513);
        const board = this.add.rectangle(0, -signHeight, 80, 40, 0x8B4513);
        const label = this.add.text(0, -signHeight, `${distance}m`, {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        sign.add([post, board, label]);
        this.signs.add(sign);
        
        // Ensure UI camera ignores this new sign
        if (this.uiCam) this.uiCam.ignore(sign);
    }

    collectStar(star) {
        if (!star.body || !star.body.enable) return;
        star.body.enable = false;

        // 10% instant velocity boost
        this.player.body.velocity.x *= 1.1;

        // Apply forward acceleration for 3 seconds
        this.player.body.setAccelerationX(300);
        
        // Visual feedback: Pulse the player
        const pulse = this.tweens.add({
            targets: this.player,
            alpha: 0.5,
            duration: 200,
            yoyo: true,
            repeat: -1
        });

        this.time.delayedCall(3000, () => {
            if (this.player && this.player.body) {
                this.player.body.setAccelerationX(0);
                pulse.stop();
                this.player.setAlpha(1);
            }
        });

        // Collection animation
        this.tweens.add({
            targets: star,
            scale: 3,
            alpha: 0,
            angle: 180,
            duration: 300,
            onComplete: () => star.destroy()
        });
    }

    collectItem(item) {
        const color = item.fillColor;
        
        // Disable physics body immediately to prevent multiple collection triggers
        if (item.body) {
            item.body.enable = false;
        }
        
        // Update inventory count
        if (this.inventory[color] !== undefined) {
            this.inventory[color]++;
            
            // Show icon and update text on first collection
            if (!this.inventoryIcons[color].visible) {
                this.inventoryIcons[color].setVisible(true);
                this.inventoryTexts[color].setVisible(true);
                this.updateInventoryLayout();
            }
            
            this.inventoryTexts[color].setText(this.inventory[color]);
        }

        // Change player color to match the collected item
        this.player.setFillStyle(color);

        // Simple collection effect
        this.tweens.add({
            targets: item,
            scale: 2,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                item.destroy();
            }
        });
    }

    updateInventoryLayout() {
        const visibleColors = this.collectibleColors.filter(c => this.inventoryIcons[c].visible);
        const spacing = 70;
        const totalWidth = (visibleColors.length - 1) * spacing;
        const startX = -totalWidth / 2;

        visibleColors.forEach((color, index) => {
            const x = startX + (index * spacing);
            this.inventoryIcons[color].setX(x);
            this.inventoryTexts[color].setX(x);
        });
    }

    create() {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor('#0000ff');
        this.cameras.main.setZoom(1.3); // Zoomed in for launch

        // UI Camera - Stays static while the main camera zooms/pans
        this.uiCam = this.cameras.add(0, 0, width, height);
        this.uiCam.setScroll(0, 0);

        const graphics = this.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0x00ff00);
        graphics.fillRect(0, 0, 32, 32);
        graphics.generateTexture('groundTex', 32, 32);

        const groundHeight = height * 0.1;
        this.ground = this.add.tileSprite(0, height - groundHeight, 2000000, groundHeight, 'groundTex');
        this.ground.setOrigin(0, 0);
        this.physics.add.existing(this.ground, true);

        // Allow camera to move left of the start line to maintain the 30% anchor
        this.cameras.main.setBounds(-width, -100000, 2000000 + width, 100000 + height);

        const charSize = 50;
        const charX = width * 0.1;
        const charY = height - groundHeight - (charSize / 2);
        this.player = this.add.rectangle(charX, charY, charSize, charSize, 0xffffff);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(false);

        this.physics.add.collider(this.player, this.ground);

        // Start following immediately at launch zoom (1.3)
        // Anchor at 10% for the initial intimate launch view
        const initialOffsetX = (-0.4 * width) / 1.3;
        this.cameras.main.startFollow(this.player, true, 1, 1, initialOffsetX, 0);

        // Create UI container - Set to 0 scroll factor
        this.uiContainer = this.add.container(0, 0).setScrollFactor(0);

        const lineStartX = (charX + charSize / 2) + (width * 0.05);
        this.launchLine = this.add.rectangle(lineStartX, charY, 100, 4, 0x000000);
        this.launchLine.setOrigin(0, 0.5); 
        this.launchLine.rotation = Phaser.Math.DegToRad(-10); 
        
        // Power/Glide Meters - Top Left (5%)
        const barWidth = width * 0.2;
        const barHeight = 25;
        const barX = width * 0.05;
        const barY = height * 0.05;
        
        this.powerBar = this.add.rectangle(barX, barY, barWidth, barHeight, 0x000000);
        this.powerBar.setOrigin(0, 0).setVisible(false);
        this.powerIndicator = this.add.rectangle(barX, barY, 0, barHeight, 0xffffff);
        this.powerIndicator.setOrigin(0, 0).setVisible(false);

        this.powerLevel = 0; 
        this.powerSpeed = 0.0018; 
        this.powerDirection = 1;

        this.glideLevel = 1; 
        this.glideMax = 1;
        this.glideConsumption = 1/6;
        this.glideRechargeRate = (1/6) / 3000; 

        this.glideBar = this.add.rectangle(barX, barY, barWidth, barHeight, 0x000000)
            .setOrigin(0, 0).setVisible(false);
        this.glideIndicator = this.add.rectangle(barX, barY, barWidth, barHeight, 0xffff00)
            .setOrigin(0, 0).setVisible(false);
        
        this.glideNote = this.add.text(barX, barY + barHeight + 5, 'GLIDE METER (Recharge: 1/6 per 3s)', {
            fontSize: '12px',
            fill: '#ffffff',
            align: 'left'
        }).setOrigin(0, 0).setVisible(false);

        this.gameState = 'AIMING'; 
        this.hasStartedAiming = false; 
        this.stopTimerStarted = false; 

        this.collectibles = this.physics.add.group();
        this.stars = this.physics.add.group();
        this.signs = this.add.group();
        this.lastSignSpawned = 0;
        this.lastSpawnX = 0;
        this.spawnFrequency = 500; 
        this.collectibleColors = [0xff0000, 0x800080, 0xffa500]; 
        
        this.inventory = {};
        this.inventoryIcons = {};
        this.inventoryTexts = {};
        this.inventoryContainer = this.add.container(width / 2, 40);

        this.collectibleColors.forEach((color) => {
            this.inventory[color] = 0;
            const icon = this.add.rectangle(0, 0, 24, 24, color).setVisible(false);
            icon.setStrokeStyle(2, 0xffffff);
            const text = this.add.text(0, 20, '0', {
                fontSize: '16px',
                fontFamily: 'Arial',
                fontStyle: 'bold',
                color: '#ffffff'
            }).setOrigin(0.5, 0).setVisible(false);

            this.inventoryIcons[color] = icon;
            this.inventoryTexts[color] = text;
            this.inventoryContainer.add([icon, text]);
        });
        
        this.uiContainer.add([
            this.powerBar, this.powerIndicator,
            this.glideBar, this.glideIndicator, this.glideNote,
            this.inventoryContainer
        ]);

        this.physics.add.overlap(this.player, this.collectibles, (player, item) => {
            this.collectItem(item);
        });

        this.physics.add.overlap(this.player, this.stars, (player, star) => {
            this.collectStar(star);
        });

        this.input.on('pointerdown', (p) => {
            if (this.gameState === 'AIMING') { this.hasStartedAiming = true; this.updateLaunchAngle(p); }
            else if (this.gameState === 'POWERING') { this.launchCharacter(); }
            else if (this.gameState === 'FLYING') { this.glideBoost(); }
        });
        this.input.on('pointermove', (p) => { if (this.gameState === 'AIMING' && this.hasStartedAiming) this.updateLaunchAngle(p); });
        this.input.on('pointerup', () => { if (this.gameState === 'AIMING' && this.hasStartedAiming) { this.gameState = 'POWERING'; this.launchLine.setVisible(false); this.powerBar.setVisible(true); this.powerIndicator.setVisible(true); } });

        this.startX = charX;
        this.distance = 0;
        
        // Distance and Spawn Note - Top Right (5%)
        const trX = width * 0.95;
        const trY = height * 0.05;
        this.distanceText = this.add.text(trX, trY, 'Distance: 0m', {
            fontSize: '24px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#000000'
        }).setOrigin(1, 0);

        this.spawnNote = this.add.text(trX, trY + 30, `Spawn Freq: ${this.spawnFrequency}px\n(Fine-tune later)`, {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: '#000000',
            align: 'right'
        }).setOrigin(1, 0);

        this.uiContainer.add([this.distanceText, this.spawnNote]);

        const endBtnX = width / 2;
        const endBtnY = height / 2;
        
        this.endBtnBg = this.add.rectangle(endBtnX, endBtnY, 260, 70, 0xffffff)
            .setVisible(false)
            .setStrokeStyle(4, 0x00ff00);
        
        this.endBtnText = this.add.text(endBtnX, endBtnY, 'END RUN', { 
            fontSize: '28px', 
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#000000' 
        }).setOrigin(0.5).setVisible(false);
        
        this.uiContainer.add([this.endBtnBg, this.endBtnText]);

        this.endBtnBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => this.endBtnBg.setFillStyle(0xe0e0e0))
            .on('pointerout', () => this.endBtnBg.setFillStyle(0xffffff))
            .on('pointerdown', () => {
                this.scene.start('RecapScene', { 
                    distance: this.distance, 
                    inventory: this.inventory,
                    colors: this.collectibleColors 
                });
            });

        // Initialize camera ignore list after all base objects are created
        // This ensures the main camera doesn't render the UI, and the UI camera doesn't render the world
        this.cameras.main.ignore(this.uiContainer);
        
        // We only ignore Game Objects. Groups aren't rendered directly, so we don't ignore them.
        // The dynamic items (collectibles, stars, signs) are ignored individually when they are spawned.
        this.uiCam.ignore([this.ground, this.player, this.launchLine]);
    }

    update(time, delta) {
        // No more manual container movement needed! 
        // The dual camera system handles static UI automatically.

        if (this.gameState === 'POWERING') {
            this.powerLevel += this.powerSpeed * delta * this.powerDirection;
            if (this.powerLevel >= 1) { this.powerLevel = 1; this.powerDirection = -1; }
            else if (this.powerLevel <= 0) { this.powerLevel = 0; this.powerDirection = 1; }
            this.powerIndicator.width = this.powerBar.width * this.powerLevel;
        }
        if (this.gameState === 'FLYING') {
            // Update distance traveled
            this.distance = Math.max(this.distance, Math.floor((this.player.x - this.startX) / 10));
            this.distanceText.setText(`Distance: ${this.distance}m`);

            // Spawning collectibles
            if (this.player.x > this.lastSpawnX + this.spawnFrequency) {
                this.spawnCollectible();
                this.lastSpawnX = this.player.x;
            }

            // Handle ground markers (signs) with a loop to prevent skipping at high speeds
            const zoom = this.cameras.main.zoom;
            const lookAheadDist = (this.scale.width / zoom) / 10;
            
            let nextSignAt = (this.lastSignSpawned < 500) ? this.lastSignSpawned + 100 : this.lastSignSpawned + 250;
            
            while (this.distance + lookAheadDist >= nextSignAt) {
                this.spawnSign(nextSignAt);
                this.lastSignSpawned = nextSignAt;
                nextSignAt = (this.lastSignSpawned < 500) ? this.lastSignSpawned + 100 : this.lastSignSpawned + 250;
            }

            // Cleanup collectibles far behind the camera
            this.collectibles.getChildren().forEach((child) => {
                if (child && child.x < this.cameras.main.scrollX - 200) {
                    child.destroy();
                }
            });

            // Cleanup signs far behind
            this.signs.getChildren().forEach((sign) => {
                if (sign && sign.x < this.cameras.main.scrollX - 200) {
                    sign.destroy();
                }
            });

            // Glide Recharge and UI
            this.glideLevel = Math.min(this.glideMax, this.glideLevel + (this.glideRechargeRate * delta));
            this.glideIndicator.width = this.glideBar.width * this.glideLevel;

            // Only update the visual tile scroll, the body stays static
            this.ground.tilePositionX = this.cameras.main.scrollX;

            // Apply friction when on the ground
            const isTouchingGround = this.player.body.touching.down || this.player.body.blocked.down;
            if (isTouchingGround) {
                this.player.body.setDragX(1000); // High friction on ground
                if (Math.abs(this.player.body.velocity.x) < 10) {
                    this.player.body.setVelocityX(0);
                    
                    // Show button with a 1-second delay after coming to a complete stop
                    if (!this.stopTimerStarted) {
                        this.stopTimerStarted = true;
                        this.time.delayedCall(1000, () => {
                            if (this.scene.isActive()) {
                                this.endBtnBg.setVisible(true);
                                this.endBtnText.setVisible(true);
                                this.glideBar.setVisible(false);
                                this.glideIndicator.setVisible(false);
                                this.glideNote.setVisible(false);
                            }
                        });
                    }
                }
            } else {
                this.player.body.setDragX(50); // Minimal air resistance
            }
        }
    }
}

class RecapScene extends Phaser.Scene {
    constructor() { super('RecapScene'); }
    init(data) {
        this.finalDistance = data.distance || 0;
        this.finalInventory = data.inventory || {};
        this.collectibleColors = data.colors || [];
    }
    create() {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor('#000000');
        
        this.add.text(width / 2, height * 0.08, 'RUN RECAP', { 
            fontSize: '36px', 
            fontFamily: '"Press Start 2P"',
            color: '#ffffff' 
        }).setOrigin(0.5);

        // Moved Restart Button Above Distance
        const btnX = width / 2;
        const btnY = height * 0.16;
        const bg = this.add.rectangle(btnX, btnY, 260, 50, 0xffffff);
        this.add.text(btnX, btnY, 'RESTART', { 
            fontSize: '20px', 
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#000000' 
        }).setOrigin(0.5);

        bg.setStrokeStyle(4, 0x00ff00);
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('StartScene'));

        this.add.text(width / 2, height * 0.24, `Distance: ${this.finalDistance}m`, { 
            fontSize: '28px', 
            fontFamily: 'Arial',
            color: '#ffff00' 
        }).setOrigin(0.5);

        // Display character "shaded" with collected colors
        const recapY = height * 0.5;
        const totalCollected = Object.values(this.finalInventory).reduce((a, b) => a + b, 0);
        const charSize = 160;
        
        if (totalCollected === 0) {
            // Default white character if nothing collected
            this.add.rectangle(width / 2, recapY, charSize, charSize, 0xffffff).setStrokeStyle(4, 0x444444);
            this.add.text(width / 2, recapY + charSize/2 + 40, 'No items collected', { 
                fontSize: '20px', 
                fontFamily: 'Arial',
                color: '#888888' 
            }).setOrigin(0.5);
        } else {
            // Draw the "Composite Cube"
            const startY = recapY - charSize / 2;
            let currentY = startY;
            
            this.collectibleColors.forEach((color) => {
                const count = this.finalInventory[color] || 0;
                if (count > 0) {
                    const stripHeight = (count / totalCollected) * charSize;
                    // Draw a segment of the cube for this color
                    this.add.rectangle(width / 2, currentY + stripHeight / 2, charSize, stripHeight, color);
                    currentY += stripHeight;
                }
            });
            
            // Outer frame to define the cube shape
            this.add.rectangle(width / 2, recapY, charSize, charSize).setStrokeStyle(6, 0xffffff);
            
            const genBtnX = width / 2;
            const genBtnY = recapY + charSize / 2 + 70;
            const genBtnBg = this.add.rectangle(genBtnX, genBtnY, 550, 80, 0x444444)
                .setStrokeStyle(2, 0xffffff);
            
            const genBtnText = this.add.text(genBtnX, genBtnY, 'CLICK HERE TO GENERATE A 3D PRINTABLE\nFILE OF YOUR UNIQUE CUBE', {
                fontSize: '12px',
                fontFamily: '"Press Start 2P"',
                color: '#ffffff',
                align: 'center',
                lineSpacing: 10
            }).setOrigin(0.5);

            genBtnBg.setInteractive({ useHandCursor: true }).on('pointerdown', async () => {
                // Show loading state
                genBtnBg.setVisible(false);
                genBtnText.setVisible(false);
                serviceBtnBg.setVisible(false);
                serviceBtnText.setVisible(false);
                const loadingText = this.add.text(genBtnX, genBtnY, 'GENERATING STL...', {
                    fontSize: '16px',
                    fontFamily: '"Press Start 2P"',
                    color: '#ffff00'
                }).setOrigin(0.5);

                // Add a simple rotating loading icon (a rectangle)
                const loadingIcon = this.add.rectangle(genBtnX, genBtnY - 40, 30, 30, 0xffff00);
                this.tweens.add({
                    targets: loadingIcon,
                    rotation: Math.PI * 2,
                    duration: 1000,
                    repeat: -1
                });

                // Small delay to simulate processing
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                    const stlData = this.generateSTL();
                    
                    // Success! Remove loading
                    loadingText.destroy();
                    loadingIcon.destroy();

                    // Show Email Input Simulation
                    this.showEmailUI(genBtnX, genBtnY, stlData);
                } catch (e) {
                    console.error(e);
                    loadingText.setText("ERROR GENERATING STL");
                    loadingIcon.setFillStyle(0xff0000);
                }
            });

            // New 3D Printing Service Button
            const serviceBtnY = genBtnY + 100;
            const serviceBtnBg = this.add.rectangle(genBtnX, serviceBtnY, 550, 60, 0x004488)
                .setStrokeStyle(2, 0xffffff);
            
            const serviceBtnText = this.add.text(genBtnX, serviceBtnY, 'CLICK HERE TO LEARN MORE ABOUT HOW WE CAN\nBRING TO LIFE YOUR UNIQUE CHARACTER', {
                fontSize: '10px',
                fontFamily: '"Press Start 2P"',
                color: '#ffffff',
                align: 'center',
                lineSpacing: 8
            }).setOrigin(0.5);

            serviceBtnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                // Hide all recap elements before showing the form
                this.children.each(child => {
                    if (child.type !== 'Graphics') { // Keep graphics if needed, but usually safe to hide all
                        child.setVisible(false);
                    }
                });
                this.showPrintingServiceUI(genBtnX, genBtnY);
            });
        }
    }

    showPrintingServiceUI(x, y) {
        const { width, height } = this.scale;
        
        // Title
        const title = this.add.text(x, height * 0.1, 'REQUEST A PHYSICAL PRINT', {
            fontSize: '20px',
            fontFamily: '"Press Start 2P"',
            color: '#00ffff'
        }).setOrigin(0.5).setVisible(true);

        const subtitle = this.add.text(x, height * 0.18, 'Our manufacturing partner will reach out\nwith a custom quote for your creation.', {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: '#ffffff',
            align: 'center'
        }).setOrigin(0.5).setVisible(true);

        // Form Container (using HTML for easier input management)
        const formHtml = `
            <div style="display: flex; flex-direction: column; gap: 15px; width: 320px; background: rgba(0,0,0,0.9); padding: 20px; border: 2px solid #00ffff; border-radius: 10px; font-family: Arial, sans-serif; box-shadow: 0 0 20px rgba(0, 255, 255, 0.2);">
                <input type="text" id="print-name" placeholder="Full Name" style="padding: 10px; border-radius: 5px; border: none; font-size: 16px;">
                <input type="email" id="print-email" placeholder="Email Address" style="padding: 10px; border-radius: 5px; border: none; font-size: 16px;">
                <input type="tel" id="print-phone" placeholder="Phone Number" style="padding: 10px; border-radius: 5px; border: none; font-size: 16px;">
                <textarea id="print-notes" placeholder="Additional Notes (Material, size...)" style="padding: 10px; border-radius: 5px; border: none; font-size: 16px; height: 60px;"></textarea>
                <button id="submit-quote" style="padding: 12px; background: #00ff00; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 16px; color: #000;">SUBMIT REQUEST</button>
                <button id="cancel-quote" style="padding: 8px; background: #444; border: none; border-radius: 5px; color: white; cursor: pointer; font-size: 14px;">BACK</button>
            </div>
        `;

        const domForm = this.add.dom(x, height * 0.62).createFromHTML(formHtml).setVisible(true);

        domForm.addListener('click');
        domForm.on('click', (event) => {
            if (event.target.id === 'submit-quote') {
                const name = domForm.getChildByID('print-name').value;
                const email = domForm.getChildByID('print-email').value;
                
                if (!name || !email) {
                    alert("Please provide at least a name and email.");
                    return;
                }

                // Show Success State
                domForm.destroy();
                subtitle.setVisible(false);
                title.setText("REQUEST SUBMITTED");
                
                const successText = this.add.text(x, height * 0.45, 
                    "The manufacturing partner will contact\nyou in 3-5 business days.\n\nClick the below button to start a new run.", {
                    fontSize: '12px',
                    fontFamily: '"Press Start 2P"',
                    color: '#ffffff',
                    align: 'center',
                    lineSpacing: 15
                }).setOrigin(0.5);

                const restartBtnBg = this.add.rectangle(x, height * 0.65, 260, 60, 0xffffff).setStrokeStyle(4, 0x00ff00).setInteractive({ useHandCursor: true });
                const restartBtnText = this.add.text(x, height * 0.65, 'RESTART', { 
                    fontSize: '24px', 
                    fontFamily: 'Arial', 
                    fontStyle: 'bold', 
                    color: '#000000' 
                }).setOrigin(0.5);
                
                restartBtnBg.on('pointerdown', () => this.scene.start('StartScene'));
            } else if (event.target.id === 'cancel-quote') {
                this.scene.restart({ distance: this.finalDistance, inventory: this.finalInventory, colors: this.collectibleColors });
            }
        });
    }

    generateSTL() {
        const scene = new THREE.Scene();
        const totalCollected = Object.values(this.finalInventory).reduce((a, b) => a + b, 0);
        const cubeSize = 20; // 20mm cube
        
        if (totalCollected === 0) {
            const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
            const mesh = new THREE.Mesh(geometry);
            scene.add(mesh);
        } else {
            let currentZ = -cubeSize / 2;
            this.collectibleColors.forEach((color) => {
                const count = this.finalInventory[color] || 0;
                if (count > 0) {
                    const segmentHeight = (count / totalCollected) * cubeSize;
                    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, segmentHeight);
                    const mesh = new THREE.Mesh(geometry);
                    mesh.position.z = currentZ + segmentHeight / 2;
                    scene.add(mesh);
                    currentZ += segmentHeight;
                }
            });
        }

        const exporter = new STLExporter();
        return exporter.parse(scene, { binary: true });
    }

    showEmailUI(x, y, stlData) {
        const { height } = this.scale;
        const titleY = y - 60 + (height * 0.03);
        const title = this.add.text(x, titleY, 'STL GENERATED!', {
            fontSize: '18px',
            fontFamily: '"Press Start 2P"',
            color: '#00ff00'
        }).setOrigin(0.5);

        // Real HTML Input for Email
        const inputElement = document.createElement('input');
        inputElement.type = 'email';
        inputElement.placeholder = 'Enter your email...';
        inputElement.style.width = '300px';
        inputElement.style.height = '30px';
        inputElement.style.fontSize = '16px';
        inputElement.style.textAlign = 'center';
        inputElement.style.padding = '5px';
        inputElement.style.borderRadius = '5px';
        inputElement.style.border = 'none';

        const domInput = this.add.dom(x, y, inputElement);

        const sendBtn = this.add.rectangle(x, y + 55, 200, 40, 0x00ff00).setOrigin(0.5).setInteractive({ useHandCursor: true });
        const sendText = this.add.text(x, y + 55, 'SEND EMAIL', {
            fontSize: '16px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: '#000000'
        }).setOrigin(0.5);

        // Download fallback
        const downloadBtn = this.add.text(x, y + 100, 'Or Click Here to Download Directly', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#aaaaff',
            textDecoration: 'underline'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        downloadBtn.on('pointerdown', () => {
            const blob = new Blob([stlData], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `unique_cube_${Date.now()}.stl`;
            link.click();
            URL.revokeObjectURL(url);
        });

        sendBtn.on('pointerdown', () => {
            const email = inputElement.value;
            if (!email || !email.includes('@')) {
                alert("Please enter a valid email address.");
                return;
            }

            sendText.setText("SENDING...");
            sendBtn.setFillStyle(0x888888);
            
            this.time.delayedCall(1500, () => {
                title.setText("SENT TO " + email.toUpperCase() + "!");
                title.setY(y); // Move the title down to the center of the UI area
                
                this.add.text(x, y + 50, '(Backend service to actually send you the\nfile needs to be set up)', {
                    fontSize: '14px',
                    fontFamily: 'Arial',
                    color: '#ffaa00',
                    align: 'center'
                }).setOrigin(0.5);

                domInput.destroy();
                sendBtn.destroy();
                sendText.destroy();
                downloadBtn.setY(y + 100);
            });
        });
    }
}

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    dom: {
        createContainer: true
    },
    physics: { default: 'arcade', arcade: { gravity: { y: 800 }, debug: false } },
    scene: [StartScene, GameScene, RecapScene],
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
};

new Phaser.Game(config);