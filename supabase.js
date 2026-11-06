
/* =====================================================
   MEIN ZIMMER – PIXEL ADVENTURE
   SUPABASE ONLINE SYSTEM
   ===================================================== */

(function () {
    "use strict";

    const SUPABASE_URL =
        "https://iwqezmgfxnyiqsmmkcfk.supabase.co";

    const SUPABASE_KEY =
        "sb_publishable_jy-Gy3WgYP4gnAKYZs1WMw_pwakf52H";

    let client = null;
    let currentPlayer = null;

    const GameOnline = {

        // Verbindung herstellen
        async connect() {
            if (client) return client;

            const { createClient } = await import(
                "https://esm.sh/@supabase/supabase-js@2"
            );

            client = createClient(
                SUPABASE_URL,
                SUPABASE_KEY,
                {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                }
            );

            console.log("Supabase verbunden!");

            return client;
        },

        // Spieler anmelden oder vorhandene Sitzung laden
        async login(playerName) {
            await this.connect();

            let { data: sessionData, error: sessionError } =
                await client.auth.getSession();

            if (sessionError) throw sessionError;

            let user = sessionData.session?.user;

            if (!user) {
                const { data, error } =
                    await client.auth.signInAnonymously();

                if (error) throw error;

                user = data.user;
            }

            if (!user) {
                throw new Error("Spieler konnte nicht angemeldet werden.");
            }

            const { data: existingProfile, error: profileError } =
                await client
                    .from("profiles")
                    .select("id, player_name")
                    .eq("id", user.id)
                    .maybeSingle();

            if (profileError) throw profileError;

            if (existingProfile) {
                currentPlayer = {
                    id: user.id,
                    name: existingProfile.player_name
                };

                return currentPlayer;
            }

            const cleanName = String(playerName || "").trim();

            if (cleanName.length < 2 || cleanName.length > 18) {
                throw new Error(
                    "Dein Spielername muss 2 bis 18 Zeichen haben."
                );
            }

            const { error: insertError } = await client
                .from("profiles")
                .insert({
                    id: user.id,
                    player_name: cleanName
                });

            if (insertError) throw insertError;

            currentPlayer = {
                id: user.id,
                name: cleanName
            };

            // Leeren Spielstand anlegen
            const { error: saveError } = await client
                .from("game_saves")
                .upsert({
                    player_id: user.id,
                    save_data: {},
                    updated_at: new Date().toISOString()
                });

            if (saveError) throw saveError;

            return currentPlayer;
        },

        // Aktuellen Spieler abrufen
        getPlayer() {
            return currentPlayer;
        },

        // Gemeinsamen Spielstand laden
        async loadSave() {
            await this.connect();

            if (!currentPlayer) {
                throw new Error("Bitte zuerst anmelden.");
            }

            const { data, error } = await client
                .from("game_saves")
                .select("save_data")
                .eq("player_id", currentPlayer.id)
                .maybeSingle();

            if (error) throw error;

            return data?.save_data || {};
        },

        // Gemeinsamen Spielstand speichern
        async saveGame(saveData) {
            await this.connect();

            if (!currentPlayer) {
                throw new Error("Bitte zuerst anmelden.");
            }

            const { error } = await client
                .from("game_saves")
                .upsert({
                    player_id: currentPlayer.id,
                    save_data: saveData,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            return true;
        },

        // Neue Welt erstellen
        async createRoom(roomName, password = null) {
            await this.connect();

            if (!currentPlayer) {
                throw new Error("Bitte zuerst anmelden.");
            }

            const { data, error } = await client.rpc(
                "create_game_room",
                {
                    p_room_name: roomName || "Meine Welt",
                    p_password: password || null
                }
            );

            if (error) throw error;

            return data[0];
        },

        // Einer Welt beitreten
        async joinRoom(inviteCode, password = null) {
            await this.connect();

            if (!currentPlayer) {
                throw new Error("Bitte zuerst anmelden.");
            }

            const { data, error } = await client.rpc(
                "join_game_room",
                {
                    p_invite_code: inviteCode,
                    p_password: password
                }
            );

            if (error) throw error;

            return data;
        },

        // Spielerposition veröffentlichen
        async updatePosition(roomId, area, x, y) {
            await this.connect();

            if (!currentPlayer) {
                throw new Error("Bitte zuerst anmelden.");
            }

            const { error } = await client
                .from("player_positions")
                .upsert({
                    player_id: currentPlayer.id,
                    room_id: roomId,
                    area: area,
                    x: x,
                    y: y,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
        },

        // Live-Spieler einer Welt beobachten
        async watchPlayers(roomId, callback) {
            await this.connect();

            if (!currentPlayer) {
                throw new Error("Bitte zuerst anmelden.");
            }

            const { data, error } = await client
                .from("player_positions")
                .select("*")
                .eq("room_id", roomId);

            if (error) throw error;

            callback(data || []);

            const channel = client
                .channel("room-" + roomId)
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "player_positions",
                        filter: "room_id=eq." + roomId
                    },
                    async () => {
                        const { data: players, error: loadError } =
                            await client
                                .from("player_positions")
                                .select("*")
                                .eq("room_id", roomId);

                        if (!loadError) {
                            callback(players || []);
                        }
                    }
                )
                .subscribe();

            return channel;
        },

        // Verbindung und Spielerstatus prüfen
        async status() {
            await this.connect();

            const { data, error } =
                await client.auth.getSession();

            if (error) throw error;

            return {
                connected: true,
                loggedIn: !!data.session,
                player: currentPlayer
            };
        },

        // Supabase-Client für weitere Erweiterungen
        getClient() {
            return client;
        }
    };

    window.GameOnline = GameOnline;

})();
