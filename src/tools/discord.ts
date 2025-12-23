import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

export const discordTools: ToolSet = {
  get_guilds: tool({
    description: "Récupère la liste de tous les serveurs Discord",
    inputSchema: z.object({}),
  }),

  get_channels: tool({
    description: "Récupère la liste des salons d'un serveur, avec filtre optionnel par nom",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      nameFilter: z.string().optional().describe("Filtre optionnel pour chercher un salon par nom"),
    }),
  }),

  get_members: tool({
    description: "Récupère la liste des membres d'un serveur, avec filtre optionnel par nom d'utilisateur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      nameFilter: z.string().optional().describe("Filtre optionnel pour chercher un membre par nom"),
    }),
  }),

  move_member: tool({
    description: "Déplace un membre vers un salon vocal",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre à déplacer"),
      channelId: z.string().describe("L'ID du salon vocal de destination"),
    }),
  }),

  disconnect_member: tool({
    description: "Déconnecte un membre de son salon vocal",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre à déconnecter"),
    }),
  }),

  get_roles: tool({
    description: "Récupère la liste des rôles d'un serveur, avec filtre optionnel par nom",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      nameFilter: z.string().optional().describe("Filtre optionnel pour chercher un rôle par nom"),
    }),
  }),

  create_role: tool({
    description: "Crée un nouveau rôle sur le serveur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      name: z.string().describe("Le nom du rôle à créer"),
      color: z.string().optional().describe("Couleur hexadécimale du rôle (optionnel)"),
    }),
  }),

  delete_role: tool({
    description: "Supprime un rôle du serveur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      roleId: z.string().describe("L'ID du rôle à supprimer"),
    }),
  }),

  add_role_to_member: tool({
    description: "Attribue un rôle à un membre",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre"),
      roleId: z.string().describe("L'ID du rôle à attribuer"),
    }),
  }),

  remove_role_from_member: tool({
    description: "Retire un rôle d'un membre",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre"),
      roleId: z.string().describe("L'ID du rôle à retirer"),
    }),
  }),

  get_categories: tool({
    description: "Récupère la liste des catégories d'un serveur, avec filtre optionnel par nom",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      nameFilter: z.string().optional().describe("Filtre optionnel pour chercher une catégorie par nom"),
    }),
  }),

  create_channel: tool({
    description: "Crée un nouveau salon sur le serveur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      name: z.string().describe("Le nom du salon à créer"),
      type: z.enum(["text", "voice", "category"]).describe("Le type de salon (text, voice, category)"),
      categoryId: z.string().optional().describe("L'ID de la catégorie parente (optionnel)"),
    }),
  }),

  delete_channel: tool({
    description: "Supprime un salon",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      channelId: z.string().describe("L'ID du salon à supprimer"),
    }),
  }),

  rename_channel: tool({
    description: "Renomme un salon",
    inputSchema: z.object({
      channelId: z.string().describe("L'ID du salon à renommer"),
      newName: z.string().describe("Le nouveau nom du salon"),
    }),
  }),

  kick_member: tool({
    description: "Expulse un membre du serveur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre à expulser"),
      reason: z.string().optional().describe("Raison de l'expulsion (optionnel)"),
    }),
  }),

  ban_member: tool({
    description: "Bannit un membre du serveur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre à bannir"),
      reason: z.string().optional().describe("Raison du bannissement (optionnel)"),
    }),
  }),

  send_message: tool({
    description: "Envoie un message texte dans un salon",
    inputSchema: z.object({
      channelId: z.string().describe("L'ID du salon où envoyer le message"),
      content: z.string().describe("Le contenu du message"),
    }),
  }),

  send_embed: tool({
    description: "Envoie un message embed dans un salon",
    inputSchema: z.object({
      channelId: z.string().describe("L'ID du salon où envoyer l'embed"),
      title: z.string().optional().describe("Titre de l'embed (optionnel)"),
      description: z.string().optional().describe("Description de l'embed (optionnel)"),
      color: z.string().optional().describe("Couleur hexadécimale de l'embed (optionnel)"),
      fields: z.array(z.object({
        name: z.string().describe("Nom du champ"),
        value: z.string().describe("Valeur du champ"),
        inline: z.boolean().optional().describe("Affichage en ligne (optionnel)"),
      })).optional().describe("Liste de champs pour l'embed (optionnel)"),
      buttons: z.array(z.object({
        label: z.string().describe("Texte du bouton"),
        url: z.string().optional().describe("URL du bouton (requis si style est 'link')"),
        style: z.string().optional().describe("Style du bouton: 'primary' (bleu), 'secondary' (gris), 'success' (vert), 'danger' (rouge), 'link' (lien)"),
      })).optional().describe("Liste de boutons à ajouter sous l'embed (optionnel)"),
    }),
  }),

  mute_member: tool({
    description: "Mute un membre dans un salon vocal",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre à mute"),
    }),
  }),

  unmute_member: tool({
    description: "Unmute un membre dans un salon vocal",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre à unmute"),
    }),
  }),

  search_internet: tool({
    description: "Recherche des informations sur internet via DuckDuckGo",
    inputSchema: z.object({
      query: z.string().describe("La requête de recherche"),
      maxResults: z.number().optional().describe("Nombre maximum de résultats (optionnel, défaut: 5)"),
    }),
  }),

  delete_messages_from_user: tool({
    description: "Supprime les messages d'un utilisateur spécifique dans un salon",
    inputSchema: z.object({
      channelId: z.string().describe("L'ID du salon"),
      userId: z.string().describe("L'ID de l'utilisateur dont les messages doivent être supprimés"),
      limit: z.number().optional().describe("Nombre maximum de messages à vérifier (optionnel, défaut: 100, max: 100)"),
    }),
  }),

  delete_messages_in_channel: tool({
    description: "Supprime plusieurs messages dans un salon",
    inputSchema: z.object({
      channelId: z.string().describe("L'ID du salon"),
      limit: z.number().optional().describe("Nombre de messages à supprimer (optionnel, défaut: 100, max: 100)"),
    }),
  }),

  send_dm: tool({
    description: "Envoie un message privé (DM) à un utilisateur",
    inputSchema: z.object({
      userId: z.string().describe("L'ID de l'utilisateur à qui envoyer le DM"),
      content: z.string().describe("Le contenu du message"),
    }),
  }),

  send_dm_embed: tool({
    description: "Envoie un message privé (DM) embed à un utilisateur",
    inputSchema: z.object({
      userId: z.string().describe("L'ID de l'utilisateur à qui envoyer le DM"),
      title: z.string().optional().describe("Titre de l'embed (optionnel)"),
      description: z.string().optional().describe("Description de l'embed (optionnel)"),
      color: z.string().optional().describe("Couleur hexadécimale de l'embed (optionnel)"),
      fields: z.array(z.object({
        name: z.string().describe("Nom du champ"),
        value: z.string().describe("Valeur du champ"),
        inline: z.boolean().optional().describe("Affichage en ligne (optionnel)"),
      })).optional().describe("Liste de champs pour l'embed (optionnel)"),
      buttons: z.array(z.object({
        label: z.string().describe("Texte du bouton"),
        url: z.string().optional().describe("URL du bouton (requis si style est 'link')"),
        style: z.string().optional().describe("Style du bouton: 'primary' (bleu), 'secondary' (gris), 'success' (vert), 'danger' (rouge), 'link' (lien)"),
      })).optional().describe("Liste de boutons à ajouter sous l'embed (optionnel)"),
    }),
  }),

  join_voice_channel: tool({
    description: "Fait rejoindre le bot dans un salon vocal",
    inputSchema: z.object({
      channelId: z.string().describe("L'ID du salon vocal à rejoindre"),
      guildId: z.string().describe("L'ID du serveur Discord"),
    }),
  }),

  leave_voice_channel: tool({
    description: "Fait quitter le bot du salon vocal actuel",
    inputSchema: z.object({}),
  }),

  rename_member: tool({
    description: "Change le surnom d'un membre sur le serveur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      memberId: z.string().describe("L'ID du membre à renommer"),
      nickname: z.string().describe("Le nouveau surnom du membre"),
    }),
  }),

  edit_role_permissions: tool({
    description: "Modifie les permissions d'un rôle sur le serveur",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      roleId: z.string().describe("L'ID du rôle à modifier"),
      permissions: z.array(z.string()).describe("Liste des permissions à activer. Permissions disponibles: Administrator, ManageGuild, ManageRoles, ManageChannels, KickMembers, BanMembers, ManageMessages, MentionEveryone, ViewChannel, SendMessages, ManageNicknames, ManageEmojisAndStickers, ModerateMembers, Connect, Speak, MuteMembers, DeafenMembers, MoveMembers, UseVAD, Stream, etc."),
    }),
  }),

  change_role_position: tool({
    description: "Change la position d'un rôle dans la hiérarchie du serveur. Position 1 est la plus haute (juste en dessous de @everyone à la position 0). Plus le nombre est petit, plus le rôle est haut dans la hiérarchie.",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      roleId: z.string().describe("L'ID du rôle à déplacer"),
      position: z.number().describe("La nouvelle position du rôle (1 = plus haut, nombres plus grands = plus bas)"),
    }),
  }),

  respond_in_voice: tool({
    description: "Répond à l'utilisateur en vocal dans son salon vocal. Utilise cette fonction quand l'utilisateur demande explicitement une réponse vocale (ex: 'dis-moi en vocal', 'réponds en voc', 'parle-moi de'). Le texte doit être conversationnel, sans markdown, adapté pour être dit à l'oral.",
    inputSchema: z.object({
      guildId: z.string().describe("L'ID du serveur Discord"),
      userId: z.string().describe("L'ID de l'utilisateur qui a fait la demande"),
      text: z.string().describe("Le texte à dire en vocal (style conversationnel, pas de markdown)"),
    }),
  }),
};
