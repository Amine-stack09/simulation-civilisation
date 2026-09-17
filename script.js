document.addEventListener('DOMContentLoaded', () => {
    // CONFIGURATION DU CANVAS ET DU CONTEXTE
    const canvas = document.getElementById('simCanvas');
    if (!canvas) {
        console.error("Impossible de trouver l'élément canvas avec id='simCanvas'");
        return;
    }
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // MONDE ET CAMÉRA
    const WORLD_SIZE = 3000;
    const SECONDS_PER_YEAR = 60; // 60 secondes de simulation = 1 an
    const TOTAL_HOUSES = 8;      // Nombre de maisons créées initialement

    const camera = {
        x: WORLD_SIZE / 2 - window.innerWidth / 2,
        y: WORLD_SIZE / 2 - window.innerHeight / 2,
        zoom: 1,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0
    };

    // CONTRÔLES SOURIS ET CAMÉRA
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            camera.isDragging = true;
            camera.dragStartX = e.clientX;
            camera.dragStartY = e.clientY;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (camera.isDragging) {
            const dx = (e.clientX - camera.dragStartX) / camera.zoom;
            const dy = (e.clientY - camera.dragStartY) / camera.zoom;
            camera.x -= dx;
            camera.y -= dy;
            camera.dragStartX = e.clientX;
            camera.dragStartY = e.clientY;
        }
    });

    canvas.addEventListener('mouseup', () => camera.isDragging = false);
    canvas.addEventListener('mouseleave', () => camera.isDragging = false);

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        let newZoom = e.deltaY < 0 ? camera.zoom * zoomFactor : camera.zoom / zoomFactor;
        newZoom = Math.min(Math.max(newZoom, 0.3), 3.0);
        
        const mouseWorldX = camera.x + e.clientX / camera.zoom;
        const mouseWorldY = camera.y + e.clientY / camera.zoom;
        
        camera.zoom = newZoom;
        camera.x = mouseWorldX - e.clientX / camera.zoom;
        camera.y = mouseWorldY - e.clientY / camera.zoom;
    }, { passive: false });

    // ÉTATS ET MÉTIERS DES HABITANTS
    const STATE = {
        IDLE: 'IDLE',
        WALKING: 'WALKING',
        WALKING_TO_FOOD: 'WALKING_TO_FOOD',
        WALKING_TO_WATER: 'WALKING_TO_WATER',
        WALKING_TO_HOME: 'WALKING_TO_HOME',
        EATING: 'EATING',
        DRINKING: 'DRINKING',
        RESTING: 'RESTING',
        // Métiers / Récolteur
        WALKING_TO_WORK: 'WALKING_TO_WORK',
        WORKING: 'WORKING',
        WALKING_TO_STORAGE: 'WALKING_TO_STORAGE',
        DEPOSITING: 'DEPOSITING'
    };

    const JOB = {
        NONE: 'AUCUN',
        HARVESTER: 'RÉCOLTEUR'
    };

    // VARIABLES DE SIMULATION
    let isPaused = false;
    let simulationTime = 0;
    let socialCheckTimer = 0;
    let totalEncounters = 0;

    let inhabitants = [];
    let foodSources = [];
    let waterSources = [];
    let trees = [];
    let houses = [];
    let foodStorage = null;

    const MALE_NAMES = ["Hugo", "Louis", "Lucas", "Gabin", "Arthur", "Léo", "Adam", "Maël"];
    const FEMALE_NAMES = ["Emma", "Jade", "Alice", "Lina", "Chloé", "Léa", "Manon", "Inès"];

    let inhabitantIdCounter = 1;

    // CLASSE FOOD STORAGE (ENTREPÔT COMMUNAURE)
    class FoodStorage {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.width = 80;
            this.height = 65;
            this.capacity = 500;
            this.currentFood = 0;
        }

        addFood(amount) {
            const space = this.capacity - this.currentFood;
            const added = Math.min(space, amount);
            this.currentFood += added;
            return added; // Retourne ce qui a été effectivement accepté
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);

            // Ombre au sol
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(-this.width / 2 + 5, this.height / 2 - 3, this.width, 10);

            // Structure principale (Bâtiment en bois solide)
            ctx.fillStyle = '#6D4C41';
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
            ctx.strokeStyle = '#3E2723';
            ctx.lineWidth = 3;
            ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

            // Toit à double pente
            ctx.fillStyle = '#4E342E';
            ctx.beginPath();
            ctx.moveTo(-this.width / 2 - 8, -this.height / 2);
            ctx.lineTo(0, -this.height / 2 - 30);
            ctx.lineTo(this.width / 2 + 8, -this.height / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Grande porte double coulissante
            ctx.fillStyle = '#8D6E63';
            ctx.fillRect(-16, this.height / 2 - 30, 32, 30);
            ctx.strokeRect(-16, this.height / 2 - 30, 32, 30);
            ctx.beginPath();
            ctx.moveTo(0, this.height / 2 - 30);
            ctx.lineTo(0, this.height / 2);
            ctx.stroke();

            // Décoration : Caisses de nourriture à côté
            if (this.currentFood > 0) {
                ctx.fillStyle = '#A1887F';
                ctx.fillRect(-this.width / 2 - 12, this.height / 2 - 16, 12, 12);
                ctx.strokeRect(-this.width / 2 - 12, this.height / 2 - 16, 12, 12);
                
                // Sac de grain
                ctx.fillStyle = '#D7CCC8';
                ctx.beginPath();
                ctx.arc(this.width / 2 + 8, this.height / 2 - 8, 7, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // Enseigne textuelle
            ctx.fillStyle = '#FFD54F';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`RÉSERVE: ${Math.floor(this.currentFood)}/${this.capacity}`, 0, -this.height / 2 - 35);

            ctx.restore();
        }
    }

    // CLASSE HOUSE (ABRI / LOGEMENT)
    class House {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.width = 60;
            this.height = 50;
            this.capacity = 2;
            this.residents = [];
        }

        isFull() {
            return this.residents.length >= this.capacity;
        }

        addResident(inhabitant) {
            if (!this.isFull() && !this.residents.includes(inhabitant)) {
                this.residents.push(inhabitant);
                return true;
            }
            return false;
        }

        removeResident(inhabitant) {
            const index = this.residents.indexOf(inhabitant);
            if (index !== -1) {
                this.residents.splice(index, 1);
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(-this.width / 2 + 4, this.height / 2 - 2, this.width, 8);

            ctx.fillStyle = '#D7CCC8';
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
            ctx.strokeStyle = '#5D4037';
            ctx.lineWidth = 2;
            ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

            ctx.fillStyle = '#A1887F';
            ctx.beginPath();
            ctx.moveTo(-this.width / 2 - 6, -this.height / 2);
            ctx.lineTo(0, -this.height / 2 - 28);
            ctx.lineTo(this.width / 2 + 6, -this.height / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#8D6E63';
            ctx.fillRect(-8, this.height / 2 - 22, 16, 22);
            ctx.strokeRect(-8, this.height / 2 - 22, 16, 22);
            ctx.fillStyle = '#FFD54F';
            ctx.beginPath();
            ctx.arc(4, this.height / 2 - 10, 1.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#E0F7FA';
            ctx.fillRect(-this.width / 2 + 8, -this.height / 2 + 10, 14, 14);
            ctx.strokeRect(-this.width / 2 + 8, -this.height / 2 + 10, 14, 14);
            ctx.beginPath();
            ctx.moveTo(-this.width / 2 + 15, -this.height / 2 + 10);
            ctx.lineTo(-this.width / 2 + 15, -this.height / 2 + 24);
            ctx.moveTo(-this.width / 2 + 8, -this.height / 2 + 17);
            ctx.lineTo(-this.width / 2 + 22, -this.height / 2 + 17);
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.residents.length}/${this.capacity}`, 0, -this.height / 2 - 32);

            ctx.restore();
        }
    }

    // CLASSES DU MONDE ET RESSOURCES
    class WaterSource {
        constructor(x, y, radius) {
            this.x = x;
            this.y = y;
            this.radius = radius;
        }

        draw() {
            ctx.fillStyle = '#2196F3';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#64B5F6';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    class Tree {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.radius = 25;
        }

        draw() {
            ctx.fillStyle = '#1B5E20';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    class FoodSource {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.maxFood = 100;
            this.currentFood = 100;
            this.radius = 18;
        }

        draw() {
            if (this.currentFood <= 0) return;
            const ratio = this.currentFood / this.maxFood;
            ctx.fillStyle = '#81C784';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * ratio + 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#E91E63';
            const berries = 4;
            for (let i = 0; i < berries; i++) {
                const angle = (i * Math.PI * 2) / berries;
                const bx = this.x + Math.cos(angle) * (this.radius * ratio * 0.5);
                const by = this.y + Math.sin(angle) * (this.radius * ratio * 0.5);
                ctx.beginPath();
                ctx.arc(bx, by, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    class Inhabitant {
        constructor(x, y) {
            this.id = inhabitantIdCounter++;
            this.x = x;
            this.y = y;
            this.radius = 10;
            this.speed = 100;
            
            // IDENTITÉ & GENRE
            this.gender = Math.random() < 0.5 ? 'HOMME' : 'FEMME';
            const nameList = this.gender === 'HOMME' ? MALE_NAMES : FEMALE_NAMES;
            this.name = nameList[Math.floor(Math.random() * nameList.length)];
            this.age = Math.floor(Math.random() * 30) + 18;

            // FOYER
            this.home = null;
            this.homeRestOffset = {
                x: (Math.random() - 0.5) * 20,
                y: 25 + Math.random() * 10
            };

            // MÉTIER ET INVENTAIRE DE TRANSPORT
            this.job = JOB.NONE;
            this.carriedFood = 0;
            this.maxCarriedFood = 30;

            // VISUEL ET VÊTEMENTS
            const maleShirts = ['#3f51b5', '#009688', '#ff9800', '#607d8b', '#795548'];
            const femaleShirts = ['#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#8bc34a'];
            const hairColors = ['#2c1b18', '#4a3728', '#b58a43', '#8d2208', '#d0c291'];

            this.shirtColor = this.gender === 'HOMME' 
                ? maleShirts[Math.floor(Math.random() * maleShirts.length)]
                : femaleShirts[Math.floor(Math.random() * femaleShirts.length)];
            this.pantsColor = this.gender === 'HOMME' ? '#263238' : '#37474f';
            this.hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];
            this.skinColor = '#ffdbac';

            this.facingDirection = 1;
            this.animTimer = Math.random() * 100;

            // PERSONNALITÉ
            this.personality = {
                sociability: Math.floor(Math.random() * 101),
                aggressiveness: Math.floor(Math.random() * 101),
                generosity: Math.floor(Math.random() * 101),
                curiosity: Math.floor(Math.random() * 101),
                discipline: Math.floor(Math.random() * 101)
            };

            this.relationships = new Map();
            
            // Besoins (0 à 100)
            this.hunger = Math.random() * 20;
            this.thirst = Math.random() * 20;
            this.energy = 80 + Math.random() * 20;
            
            this.state = STATE.IDLE;
            this.target = null;
            this.targetPos = null;

            this.socialIndicator = null;
        }

        getLifePhase() {
            if (this.age < 13) return 'ENFANT';
            if (this.age < 60) return 'ADULTE';
            return 'AGE';
        }

        getPersonalityDescription() {
            const traits = [];
            const p = this.personality;

            if (p.sociability >= 70) traits.push('Sociable');
            else if (p.sociability <= 30) traits.push('Solitaire');

            if (p.aggressiveness >= 70) traits.push('Agressif');
            else if (p.aggressiveness <= 30) traits.push('Calme');

            if (p.curiosity >= 70) traits.push('Curieux');
            if (p.discipline >= 70) traits.push('Discipliné');
            if (p.generosity >= 70) traits.push('Généreux');

            if (traits.length === 0) return 'Neutre';
            return traits.slice(0, 2).join(', ');
        }

        getRelationship(other) {
            if (!this.relationships.has(other.id)) {
                this.relationships.set(other.id, {
                    score: 0,
                    meetings: 0,
                    lastInteraction: 0
                });
            }
            return this.relationships.get(other.id);
        }

        modifyRelationship(other, amount) {
            const rel = this.getRelationship(other);
            rel.score = Math.max(-100, Math.min(100, rel.score + amount));
            return rel.score;
        }

        setSocialIndicator(text, color) {
            this.socialIndicator = {
                text: text,
                color: color,
                timer: 1.8
            };
        }

        assignHome(house) {
            if (house && house.addResident(this)) {
                this.home = house;
                return true;
            }
            return false;
        }

        update(dt) {
            this.age += dt / SECONDS_PER_YEAR;
            this.animTimer += dt * 8;

            this.thirst = Math.min(100, this.thirst + 2.4 * dt);
            this.hunger = Math.min(100, this.hunger + 1.5 * dt);
            
            if (this.state === STATE.RESTING) {
                this.energy = Math.min(100, this.energy + 9.0 * dt);
            } else {
                this.energy = Math.max(0, this.energy - 0.9 * dt);
            }

            if (this.socialIndicator) {
                this.socialIndicator.timer -= dt;
                if (this.socialIndicator.timer <= 0) {
                    this.socialIndicator = null;
                }
            }

            this.evaluateStateAndNeeds();
            this.executeStateLogic(dt);
        }

        evaluateStateAndNeeds() {
            // Actions en cours bloquantes sauf si condition de sortie
            if (this.state === STATE.EATING) {
                if (!this.target || this.target.currentFood <= 0 || this.hunger <= 5) {
                    this.state = STATE.IDLE;
                    this.target = null;
                    this.targetPos = null;
                }
                return;
            }

            if (this.state === STATE.DRINKING) {
                if (this.thirst <= 5) {
                    this.state = STATE.IDLE;
                    this.target = null;
                    this.targetPos = null;
                }
                return;
            }

            if (this.state === STATE.RESTING) {
                if (this.energy >= 95 || this.thirst > 80 || this.hunger > 85) {
                    this.state = STATE.IDLE;
                } else {
                    return;
                }
            }

            if (this.state === STATE.WORKING) {
                if (this.carriedFood >= this.maxCarriedFood || !this.target || this.target.currentFood <= 0) {
                    this.state = STATE.IDLE;
                } else if (this.thirst > 50 || this.hunger > 50 || this.energy < 25) {
                    this.state = STATE.IDLE; // Interrompre le travail pour besoin urgent
                } else {
                    return;
                }
            }

            if (this.state === STATE.DEPOSITING) {
                if (this.carriedFood <= 0 || !foodStorage || foodStorage.currentFood >= foodStorage.capacity) {
                    this.state = STATE.IDLE;
                } else {
                    return;
                }
            }

            if (this.state === STATE.WALKING_TO_WATER) {
                if (!this.target) this.state = STATE.IDLE;
                else return;
            }

            if (this.state === STATE.WALKING_TO_FOOD) {
                if (!this.target || this.target.currentFood <= 0) {
                    this.state = STATE.IDLE;
                    this.target = null;
                    this.targetPos = null;
                } else return;
            }

            if (this.state === STATE.WALKING_TO_HOME) {
                if (!this.home) this.state = STATE.IDLE;
                else return;
            }

            if (this.state === STATE.WALKING_TO_WORK) {
                if (!this.target || this.target.currentFood <= 0) {
                    this.state = STATE.IDLE;
                    this.target = null;
                    this.targetPos = null;
                } else return;
            }

            if (this.state === STATE.WALKING_TO_STORAGE) {
                if (!foodStorage) this.state = STATE.IDLE;
                else return;
            }

            // ORDRE ABSOLU DE PRIORITÉ DES BESOINS : SOIF -> FAIM -> ÉNERGIE -> TRAVAIL -> IDLE
            const disciplineModifier = (this.personality.discipline - 50) * 0.15;
            const thirstThreshold = 40 - disciplineModifier;
            const hungerThreshold = 40 - disciplineModifier;
            const energyThreshold = 30 + disciplineModifier;

            if (this.thirst > thirstThreshold) {
                const nearestWater = this.getNearest(waterSources);
                if (nearestWater) {
                    this.target = nearestWater;
                    this.targetPos = { x: nearestWater.x, y: nearestWater.y };
                    this.state = STATE.WALKING_TO_WATER;
                    return;
                }
            }

            if (this.hunger > hungerThreshold) {
                const availableFood = foodSources.filter(f => f.currentFood > 0);
                const nearestFood = this.getNearest(availableFood);
                if (nearestFood) {
                    this.target = nearestFood;
                    this.targetPos = { x: nearestFood.x, y: nearestFood.y };
                    this.state = STATE.WALKING_TO_FOOD;
                    return;
                }
            }

            if (this.energy < energyThreshold) {
                if (this.home) {
                    this.target = this.home;
                    this.targetPos = {
                        x: this.home.x + this.homeRestOffset.x,
                        y: this.home.y + this.homeRestOffset.y
                    };
                    this.state = STATE.WALKING_TO_HOME;
                } else {
                    this.state = STATE.RESTING;
                    this.target = null;
                    this.targetPos = null;
                }
                return;
            }

            // TRAVAIL DU RÉCOLTEUR (Si pas de besoin urgent)
            if (this.job === JOB.HARVESTER) {
                // 1. Si son sac est plein, il doit aller déposer au stockage
                if (this.carriedFood >= this.maxCarriedFood) {
                    if (foodStorage && foodStorage.currentFood < foodStorage.capacity) {
                        this.target = foodStorage;
                        this.targetPos = { x: foodStorage.x, y: foodStorage.y + 20 };
                        this.state = STATE.WALKING_TO_STORAGE;
                        return;
                    }
                }
                // 2. Sinon, s'il transport de la nourriture et que le buisson est épuisé
                else if (this.carriedFood > 0 && (!this.target || this.target.currentFood <= 0)) {
                    if (foodStorage && foodStorage.currentFood < foodStorage.capacity) {
                        this.target = foodStorage;
                        this.targetPos = { x: foodStorage.x, y: foodStorage.y + 20 };
                        this.state = STATE.WALKING_TO_STORAGE;
                        return;
                    }
                }
                // 3. Sinon, il cherche un buisson de nourriture à récolter
                else {
                    const availableFood = foodSources.filter(f => f.currentFood > 0);
                    const nearestFood = this.getNearest(availableFood);
                    if (nearestFood) {
                        this.target = nearestFood;
                        this.targetPos = { x: nearestFood.x, y: nearestFood.y };
                        this.state = STATE.WALKING_TO_WORK;
                        return;
                    }
                }
            }

            // DÉPLACEMENT LIBRE ET DÉCISION D'ERRANCE / REPOS
            if (this.state === STATE.IDLE) {
                this.setRandomDestination();
            }
        }

        executeStateLogic(dt) {
            switch (this.state) {
                case STATE.WALKING:
                case STATE.WALKING_TO_FOOD:
                case STATE.WALKING_TO_WATER:
                case STATE.WALKING_TO_HOME:
                case STATE.WALKING_TO_WORK:
                case STATE.WALKING_TO_STORAGE:
                    this.moveToTarget(dt);
                    break;
                case STATE.EATING:
                    if (this.target && this.target.currentFood > 0) {
                        const amount = 18.0 * dt;
                        this.target.currentFood = Math.max(0, this.target.currentFood - amount);
                        this.hunger = Math.max(0, this.hunger - amount * 1.5);
                    }
                    break;
                case STATE.DRINKING:
                    this.thirst = Math.max(0, this.thirst - 30.0 * dt);
                    break;
                case STATE.WORKING:
                    if (this.target && this.target.currentFood > 0 && this.carriedFood < this.maxCarriedFood) {
                        const harvestSpeed = 12.0 * dt; // Récolte 12 unités/s
                        const harvestAmount = Math.min(harvestSpeed, this.target.currentFood, this.maxCarriedFood - this.carriedFood);
                        this.target.currentFood -= harvestAmount;
                        this.carriedFood += harvestAmount;
                    }
                    break;
                case STATE.DEPOSITING:
                    if (foodStorage && this.carriedFood > 0) {
                        const depositSpeed = 25.0 * dt; // Dépose 25 unités/s
                        const amountToDeposit = Math.min(depositSpeed, this.carriedFood);
                        const accepted = foodStorage.addFood(amountToDeposit);
                        this.carriedFood -= accepted;
                    }
                    break;
                case STATE.RESTING:
                case STATE.IDLE:
                    break;
            }
        }

        moveToTarget(dt) {
            if (!this.targetPos) {
                this.state = STATE.IDLE;
                return;
            }

            const dx = this.targetPos.x - this.x;
            const dy = this.targetPos.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (Math.abs(dx) > 0.1) {
                this.facingDirection = dx > 0 ? 1 : -1;
            }

            let reachThreshold = 5;
            if (this.state === STATE.WALKING_TO_WATER && this.target) {
                reachThreshold = this.target.radius + 2;
            } else if ((this.state === STATE.WALKING_TO_FOOD || this.state === STATE.WALKING_TO_WORK) && this.target) {
                reachThreshold = this.target.radius + 2;
            } else if (this.state === STATE.WALKING_TO_HOME && this.target) {
                reachThreshold = 6;
            } else if (this.state === STATE.WALKING_TO_STORAGE && foodStorage) {
                reachThreshold = 15;
            }

            if (dist <= reachThreshold) {
                if (this.state === STATE.WALKING_TO_WATER) {
                    this.state = STATE.DRINKING;
                } else if (this.state === STATE.WALKING_TO_FOOD) {
                    this.state = STATE.EATING;
                } else if (this.state === STATE.WALKING_TO_WORK) {
                    this.state = STATE.WORKING;
                } else if (this.state === STATE.WALKING_TO_STORAGE) {
                    this.state = STATE.DEPOSITING;
                } else if (this.state === STATE.WALKING_TO_HOME) {
                    this.state = STATE.RESTING;
                } else {
                    this.state = STATE.IDLE;
                    this.target = null;
                    this.targetPos = null;
                }
                return;
            }

            const moveStep = this.speed * dt;
            this.x += (dx / dist) * Math.min(dist, moveStep);
            this.y += (dy / dist) * Math.min(dist, moveStep);
        }

        setRandomDestination() {
            if (this.personality.sociability > 45 && inhabitants.length > 1 && Math.random() < (this.personality.sociability / 100) * 0.65) {
                const others = inhabitants.filter(h => h !== this);
                if (others.length > 0) {
                    const targetPerson = others[Math.floor(Math.random() * others.length)];
                    const offsetAngle = Math.random() * Math.PI * 2;
                    const offsetDist = 20 + Math.random() * 30;
                    let tx = targetPerson.x + Math.cos(offsetAngle) * offsetDist;
                    let ty = targetPerson.y + Math.sin(offsetAngle) * offsetDist;

                    tx = Math.max(50, Math.min(WORLD_SIZE - 50, tx));
                    ty = Math.max(50, Math.min(WORLD_SIZE - 50, ty));

                    this.targetPos = { x: tx, y: ty };
                    this.target = null;
                    this.state = STATE.WALKING;
                    return;
                }
            }

            let angle = Math.random() * Math.PI * 2;
            const curiosityBonus = (this.personality.curiosity / 100) * 120;
            let distance = 40 + curiosityBonus + Math.random() * 100;

            let tx = this.x + Math.cos(angle) * distance;
            let ty = this.y + Math.sin(angle) * distance;

            tx = Math.max(50, Math.min(WORLD_SIZE - 50, tx));
            ty = Math.max(50, Math.min(WORLD_SIZE - 50, ty));

            this.targetPos = { x: tx, y: ty };
            this.target = null;
            this.state = STATE.WALKING;
        }

        getNearest(list) {
            let nearest = null;
            let minDist = Infinity;
            for (const item of list) {
                const d = Math.hypot(item.x - this.x, item.y - this.y);
                if (d < minDist) {
                    minDist = d;
                    nearest = item;
                }
            }
            return nearest;
        }

        draw() {
            if (this.state === STATE.RESTING && this.home && Math.hypot(this.x - (this.home.x + this.homeRestOffset.x), this.y - (this.home.y + this.homeRestOffset.y)) < 10) {
                return;
            }

            ctx.save();
            ctx.translate(this.x, this.y);

            const isWalking = [STATE.WALKING, STATE.WALKING_TO_FOOD, STATE.WALKING_TO_WATER, STATE.WALKING_TO_HOME, STATE.WALKING_TO_WORK, STATE.WALKING_TO_STORAGE].includes(this.state);
            const isResting = this.state === STATE.RESTING;
            const isEating = this.state === STATE.EATING;
            const isDrinking = this.state === STATE.DRINKING;
            const isWorking = this.state === STATE.WORKING;

            const dir = this.facingDirection;
            let postureAngle = 0;
            if (this.personality.aggressiveness > 70) postureAngle = 0.08 * dir;

            if (isResting) {
                ctx.rotate(Math.PI / 2);
            } else {
                ctx.rotate(postureAngle);
            }

            const walkCycle = isWalking ? Math.sin(this.animTimer) : 0;
            const bobbing = isWalking ? Math.abs(Math.sin(this.animTimer * 2)) * 2 : 0;
            const actionCycle = (isEating || isDrinking || isWorking) ? Math.sin(this.animTimer * 1.5) * 4 : 0;

            // Ombre au sol
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.ellipse(0, 14, 9, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.translate(0, -bobbing);

            // Jambes
            const legY = 2;
            const legSwing = walkCycle * 5;
            ctx.fillStyle = this.pantsColor;
            ctx.fillRect(-4 + legSwing * dir, legY, 3, 9);
            ctx.fillStyle = '#111';
            ctx.fillRect(-5 + legSwing * dir, legY + 8, 4, 3);

            ctx.fillStyle = this.pantsColor;
            ctx.fillRect(1 - legSwing * dir, legY, 3, 9);
            ctx.fillStyle = '#111';
            ctx.fillRect(1 - legSwing * dir, legY + 8, 4, 3);

            // Torse
            ctx.fillStyle = this.shirtColor;
            ctx.fillRect(-5, -8, 10, 11);

            // Bras
            const armY = -7;
            const armSwing = walkCycle * 6;
            ctx.fillStyle = this.skinColor;
            ctx.fillRect(-7 - armSwing * dir, armY, 3, 8);

            ctx.fillStyle = this.skinColor;
            if (isEating || isDrinking || isWorking) {
                ctx.fillRect(4 * dir, armY + 2 - actionCycle, 3, 7);
                ctx.fillStyle = isWorking ? '#81C784' : (isEating ? '#e91e63' : '#2196f3');
                ctx.beginPath();
                ctx.arc((5 + actionCycle * 0.5) * dir, armY + 3 - actionCycle, 3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(4 + armSwing * dir, armY, 3, 8);
            }

            // Transport de nourriture (Panier/Sac porté sur le dos/côté)
            if (this.carriedFood > 0) {
                ctx.fillStyle = '#A1887F';
                ctx.fillRect(-8 * dir, -4, 5, 7);
                ctx.fillStyle = '#E91E63';
                ctx.beginPath();
                ctx.arc(-5.5 * dir, -5, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Tête
            ctx.fillStyle = this.skinColor;
            ctx.fillRect(-1.5, -11, 3, 3);
            ctx.beginPath();
            ctx.arc(0, -15, 6, 0, Math.PI * 2);
            ctx.fill();

            // Yeux
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(2 * dir, -16, 1, 0, Math.PI * 2);
            ctx.arc(4 * dir, -16, 1, 0, Math.PI * 2);
            ctx.fill();

            // Bouche
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            if (this.personality.sociability > 70) {
                ctx.arc(3 * dir, -13, 1.5, 0, Math.PI);
            } else {
                ctx.moveTo(1.5 * dir, -13);
                ctx.lineTo(4 * dir, -13);
            }
            ctx.stroke();

            // Cheveux
            ctx.fillStyle = this.hairColor;
            if (this.gender === 'HOMME') {
                ctx.beginPath();
                ctx.arc(0, -17, 6.5, Math.PI, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(0, -16, 7, Math.PI * 0.8, Math.PI * 2.2);
                ctx.fill();
                ctx.fillRect(-5 * dir, -16, 3, 9);
            }

            ctx.restore();

            // Indicateur social
            if (this.socialIndicator) {
                ctx.save();
                ctx.fillStyle = this.socialIndicator.color;
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(this.socialIndicator.text, this.x, this.y - 66);
                ctx.restore();
            }

            // Textes et jauges au-dessus de la tête
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            
            const textY = this.y - 58;
            const lifePhase = this.getLifePhase();
            const personalityDesc = this.getPersonalityDescription();
            const genderSymbol = this.gender === 'HOMME' ? 'H' : 'F';
            const homeIcon = this.home ? ' 🏠' : '';

            ctx.fillText(`${this.name}${homeIcon} (${Math.floor(this.age)}a)`, this.x, textY);
            ctx.fillText(`${lifePhase} • ${genderSymbol}`, this.x, textY + 10);
            ctx.fillText(`[${personalityDesc}]`, this.x, textY + 20);
            ctx.fillText(`${this.job}`, this.x, textY + 30);
            ctx.fillText(`${this.state}`, this.x, textY + 40);

            // Jauges
            const barWidth = 36;
            const barHeight = 4;
            const barSpacing = 2;
            const startX = this.x - barWidth / 2;
            let currentY = textY + 46;

            const drawBar = (valPercent, fillColor) => {
                const clampedVal = Math.max(0, Math.min(100, valPercent));
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(startX, currentY, barWidth, barHeight);
                
                ctx.fillStyle = fillColor;
                ctx.fillRect(startX, currentY, (barWidth * clampedVal) / 100, barHeight);

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(startX, currentY, barWidth, barHeight);

                currentY += barHeight + barSpacing;
            };

            drawBar(this.hunger, '#e53935');
            drawBar(this.thirst, '#1e88e5');
            drawBar(this.energy, '#4caf50');
        }
    }

    // GESTION DES INTERACTIONS SOCIALES
    function checkSocialInteractions() {
        const ENCOUNTER_DISTANCE = 80;
        const INTERACTION_COOLDOWN = 4.0;

        for (let i = 0; i < inhabitants.length; i++) {
            for (let j = i + 1; j < inhabitants.length; j++) {
                const a = inhabitants[i];
                const b = inhabitants[j];

                if (a.state === STATE.RESTING && a.home && Math.hypot(a.x - (a.home.x + a.homeRestOffset.x), a.y - (a.home.y + a.homeRestOffset.y)) < 10) continue;
                if (b.state === STATE.RESTING && b.home && Math.hypot(b.x - (b.home.x + b.homeRestOffset.x), b.y - (b.home.y + b.homeRestOffset.y)) < 10) continue;

                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (dist <= ENCOUNTER_DISTANCE) {
                    const relA = a.getRelationship(b);
                    
                    if (simulationTime - relA.lastInteraction < INTERACTION_COOLDOWN) {
                        continue;
                    }

                    relA.meetings++;
                    relA.lastInteraction = simulationTime;

                    const relB = b.getRelationship(a);
                    relB.meetings++;
                    relB.lastInteraction = simulationTime;

                    totalEncounters++;

                    const avgSoc = (a.personality.sociability + b.personality.sociability) / 2;
                    const avgAgg = (a.personality.aggressiveness + b.personality.aggressiveness) / 2;
                    const avgGen = (a.personality.generosity + b.personality.generosity) / 2;
                    const avgCur = (a.personality.curiosity + b.personality.curiosity) / 2;

                    let delta = (Math.random() - 0.42) * 10;
                    delta += (avgSoc - 50) * 0.08;
                    delta -= (avgAgg - 50) * 0.12;
                    
                    if (delta > 0) delta += (avgGen / 100) * 3;
                    if (relA.meetings === 1) delta += (avgCur / 100) * 4;

                    if (relA.score >= 40) delta += 2.5;
                    else if (relA.score <= -40) delta -= 3.5;

                    delta = Math.max(-15, Math.min(15, delta));
                    a.modifyRelationship(b, delta);
                    b.modifyRelationship(a, delta);

                    if (delta > 2.0) {
                        a.setSocialIndicator('♥', '#ff4081');
                        b.setSocialIndicator('♥', '#ff4081');
                    } else if (delta < -2.0) {
                        a.setSocialIndicator('!', '#f44336');
                        b.setSocialIndicator('!', '#f44336');
                    } else {
                        a.setSocialIndicator('•', '#ffeb3b');
                        b.setSocialIndicator('•', '#ffeb3b');
                    }
                }
            }
        }
    }

    // ALGORITHME DE PLACEMENT SÉCURISÉ DES MAISONS
    function createHouses() {
        houses = [];
        const centerX = WORLD_SIZE / 2;
        const centerY = WORLD_SIZE / 2;
        let attempts = 0;

        while (houses.length < TOTAL_HOUSES && attempts < 500) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const dist = 160 + Math.random() * 320;
            const hx = centerX + Math.cos(angle) * dist;
            const hy = centerY + Math.sin(angle) * dist;

            let tooCloseToWater = false;
            for (const w of waterSources) {
                if (Math.hypot(hx - w.x, hy - w.y) < w.radius + 60) {
                    tooCloseToWater = true;
                    break;
                }
            }
            if (tooCloseToWater) continue;

            let tooCloseToHouse = false;
            for (const h of houses) {
                if (Math.hypot(hx - h.x, hy - h.y) < 110) {
                    tooCloseToHouse = true;
                    break;
                }
            }
            if (tooCloseToHouse) continue;

            let tooCloseToFood = false;
            for (const f of foodSources) {
                if (Math.hypot(hx - f.x, hy - f.y) < f.radius + 40) {
                    tooCloseToFood = true;
                    break;
                }
            }
            if (tooCloseToFood) continue;

            houses.push(new House(hx, hy));
        }
    }

    // INITIALISATION DU MONDE
    function initWorld() {
        inhabitants = [];
        foodSources = [];
        waterSources = [];
        trees = [];
        houses = [];
        simulationTime = 0;
        socialCheckTimer = 0;
        totalEncounters = 0;
        inhabitantIdCounter = 1;

        // Positionnement de l'Entrepôt Communal au centre de la zone de colonie
        foodStorage = new FoodStorage(WORLD_SIZE / 2, WORLD_SIZE / 2 - 80);

        // Sources d'eau
        waterSources.push(new WaterSource(WORLD_SIZE / 2, WORLD_SIZE / 2 + 120, 80));
        waterSources.push(new WaterSource(WORLD_SIZE / 2 - 450, WORLD_SIZE / 2 + 350, 60));
        waterSources.push(new WaterSource(WORLD_SIZE / 2 + 550, WORLD_SIZE / 2 - 250, 70));

        // Buissons de nourriture
        for (let i = 0; i < 25; i++) {
            const x = Math.random() * (WORLD_SIZE - 200) + 100;
            const y = Math.random() * (WORLD_SIZE - 200) + 100;
            foodSources.push(new FoodSource(x, y));
        }

        // Arbres
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * (WORLD_SIZE - 200) + 100;
            const y = Math.random() * (WORLD_SIZE - 200) + 100;
            trees.push(new Tree(x, y));
        }

        // Création des maisons
        createHouses();

        // Création des habitants
        for (let i = 0; i < 14; i++) {
            const x = WORLD_SIZE / 2 + (Math.random() - 0.5) * 350;
            const y = WORLD_SIZE / 2 + (Math.random() - 0.5) * 350;
            const hab = new Inhabitant(x, y);

            // Attribution d'un logement
            for (const h of houses) {
                if (hab.assignHome(h)) {
                    break;
                }
            }

            // Attribution du métier de Récolteur (30% à 40% de probabilité favorisée par la discipline)
            const harvesterProbability = 0.25 + (hab.personality.discipline / 100) * 0.3;
            if (Math.random() < harvesterProbability) {
                hab.job = JOB.HARVESTER;
            }

            inhabitants.push(hab);
        }
    }

    // MISE À JOUR DU PANNEAU D'INTERFACE
    function updateUI() {
        document.getElementById('stat-population').textContent = inhabitants.length;
        
        const males = inhabitants.filter(h => h.gender === 'HOMME').length;
        const females = inhabitants.filter(h => h.gender === 'FEMME').length;
        document.getElementById('stat-males').textContent = males;
        document.getElementById('stat-females').textContent = females;

        const harvesters = inhabitants.filter(h => h.job === JOB.HARVESTER).length;
        document.getElementById('stat-harvesters').textContent = harvesters;

        const housedCount = inhabitants.filter(h => h.home !== null).length;
        const homelessCount = inhabitants.length - housedCount;
        document.getElementById('stat-houses').textContent = houses.length;
        document.getElementById('stat-housed').textContent = housedCount;
        document.getElementById('stat-homeless').textContent = homelessCount;

        if (foodStorage) {
            document.getElementById('stat-stored-food').textContent = Math.floor(foodStorage.currentFood);
            document.getElementById('stat-storage-cap').textContent = foodStorage.capacity;
        }

        let friendCount = 0;
        let conflictCount = 0;

        for (let i = 0; i < inhabitants.length; i++) {
            for (let j = i + 1; j < inhabitants.length; j++) {
                const rel = inhabitants[i].getRelationship(inhabitants[j]);
                if (rel.score >= 40) friendCount++;
                else if (rel.score <= -40) conflictCount++;
            }
        }

        document.getElementById('stat-friendships').textContent = friendCount;
        document.getElementById('stat-negatives').textContent = conflictCount;
        document.getElementById('stat-encounters').textContent = totalEncounters;

        const activeFood = foodSources.filter(f => f.currentFood > 0).length;
        document.getElementById('stat-food').textContent = activeFood;
        document.getElementById('stat-trees').textContent = trees.length;

        if (inhabitants.length > 0) {
            const avgHunger = inhabitants.reduce((acc, h) => acc + h.hunger, 0) / inhabitants.length;
            const avgThirst = inhabitants.reduce((acc, h) => acc + h.thirst, 0) / inhabitants.length;
            const avgEnergy = inhabitants.reduce((acc, h) => acc + h.energy, 0) / inhabitants.length;

            document.getElementById('stat-avg-hunger').textContent = Math.round(avgHunger);
            document.getElementById('stat-avg-thirst').textContent = Math.round(avgThirst);
            document.getElementById('stat-avg-energy').textContent = Math.round(avgEnergy);
        } else {
            document.getElementById('stat-avg-hunger').textContent = 0;
            document.getElementById('stat-avg-thirst').textContent = 0;
            document.getElementById('stat-avg-energy').textContent = 0;
        }

        document.getElementById('stat-time').textContent = Math.floor(simulationTime);
    }

    // ÉVÉNEMENTS BOUTONS
    document.getElementById('btn-pause').addEventListener('click', () => {
        isPaused = !isPaused;
        document.getElementById('btn-pause').textContent = isPaused ? "Reprendre" : "Pause";
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        initWorld();
    });

    // BOUCLE PRINCIPALE
    let lastTime = performance.now();

    function gameLoop(now) {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        if (!isPaused) {
            simulationTime += dt;
            socialCheckTimer += dt;

            inhabitants.forEach(h => h.update(dt));

            if (socialCheckTimer >= 0.5) {
                checkSocialInteractions();
                socialCheckTimer = 0;
            }
        }

        // RENDU
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Fond du monde
        ctx.fillStyle = '#5f8f45';
        ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        ctx.strokeStyle = '#4b7235';
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);

        // Dessin des structures et entités
        waterSources.forEach(w => w.draw());
        trees.forEach(t => t.draw());
        foodSources.forEach(f => f.draw());
        if (foodStorage) foodStorage.draw();
        houses.forEach(h => h.draw());
        inhabitants.forEach(h => h.draw());

        ctx.restore();

        updateUI();
        requestAnimationFrame(gameLoop);
    }

    // LANCEMENT INITIAL
    initWorld();
    requestAnimationFrame(gameLoop);
});