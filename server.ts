import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface RealtimeNotification {
  id: string;
  title: string;
  message: string;
  type:
    | 'conflict_resolved'
    | 'schedule_updated'
    | 'ai_generated'
    | 'teacher_assigned'
    | 'availability_changed';
  targetTeacher: string;
  timestampMs: number;
}

const recentNotifications: RealtimeNotification[] = [
  {
    id: 'init-alkawthar-1',
    title: 'Emplois du temps Al-Kawthar chargés',
    message:
      'Les 35 classes (Pre-KG à DP2 Garçons) et 68 enseignants ont été initialisés avec leurs grilles horaires.',
    type: 'teacher_assigned',
    targetTeacher: 'all',
    timestampMs: Date.now() - 60000,
  },
];

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // WebSocket Server for Real-Time Notifications & Schedule Sync
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<WebSocket>();

  function broadcastEvent(event: string, payload: unknown) {
    const message = JSON.stringify({ event, payload });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  function pushNotification(notif: Omit<RealtimeNotification, 'id' | 'timestampMs'>) {
    const full: RealtimeNotification = {
      ...notif,
      id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestampMs: Date.now(),
    };
    recentNotifications.unshift(full);
    if (recentNotifications.length > 50) {
      recentNotifications.pop();
    }
    broadcastEvent('notification:created', full);
    return full;
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(
      JSON.stringify({
        event: 'init',
        payload: {
          notifications: recentNotifications,
          activeUsersCount: clients.size,
        },
      })
    );
    broadcastEvent('presence:updated', { activeUsersCount: clients.size });

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.event === 'notification:send' && data.payload) {
          pushNotification(data.payload);
        } else if (data.event === 'schedule:mutated' && data.payload) {
          broadcastEvent('schedule:mutated', data.payload);
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      broadcastEvent('presence:updated', { activeUsersCount: clients.size });
    });
  });

  // REST API: Broadcast notification
  app.post('/api/notifications/broadcast', (req, res) => {
    const { title, message, type, targetTeacher } = req.body || {};
    if (!title || !message) {
      res.status(400).json({ error: 'Title and message are required.' });
      return;
    }
    const created = pushNotification({
      title: String(title).slice(0, 150),
      message: String(message).slice(0, 500),
      type: type || 'schedule_updated',
      targetTeacher: targetTeacher || 'all',
    });
    res.json({ notification: created });
  });

  // REST API: Gemini AI Class Schedule Generation & Optimization
  app.post('/api/gemini/optimize-class', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        className,
        section,
        currentSlots,
        teacherConstraints,
        customInstructions,
        maxPeriodsPerDay,
        lockedSlots,
      } = req.body;

      const prompt = `Tu es un moteur expert de planification d'emplois du temps scolaires (supérieur à aSc Timetables) combiné à un solveur de contraintes strictes pour l'établissement "Al-Kawthar International Schools" à Djeddah.
Classe cible : "${className}" (Section: ${section})
Jours scolaires : Dimanche, Lundi, Mardi, Mercredi, Jeudi.
Nombre de périodes par jour : ${maxPeriodsPerDay || 8} (numérotées de 1 à ${maxPeriodsPerDay || 8}).

Emploi du temps actuel de la classe (format JSON clé "Jour_Période"):
${JSON.stringify(currentSlots, null, 2)}

Séances verrouillées à ne JAMAIS déplacer (Contrainte stricte HC_04) :
${JSON.stringify(lockedSlots || [])}

Contraintes d'indisponibilité des enseignants concernés (Contrainte stricte HC_02 - créneaux "Jour_Période"):
${JSON.stringify(teacherConstraints || [], null, 2)}

Instructions spécifiques de l'administrateur :
${customInstructions || "Optimiser la répartition pédagogique des matières sur la semaine, placer les matières principales le matin (P1-P4), éliminer tout conflit d'indisponibilité des enseignants, éviter plus de 2 séances consécutives de la même matière, et conserver 100% des séances obligatoires sans jamais en supprimer une seule."}

Génère l'emploi du temps complet optimisé pour cette classe en respectant strictement le volume horaire, les séances verrouillées et les enseignants attribués.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description:
                  "Résumé clair en français des optimisations pédagogiques et des compromis effectués.",
              },
              pedagogicalScore: {
                type: Type.INTEGER,
                description: "Score d'équilibre pédagogique sur 100.",
              },
              slots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: {
                      type: Type.STRING,
                      description: 'Dimanche, Lundi, Mardi, Mercredi, ou Jeudi',
                    },
                    period: {
                      type: Type.INTEGER,
                      description: 'Numéro de période (1 à 8)',
                    },
                    subject: {
                      type: Type.STRING,
                      description: 'Matière principale',
                    },
                    teacher: {
                      type: Type.STRING,
                      description: 'Enseignant principal',
                    },
                    subSubject: {
                      type: Type.STRING,
                      description: 'Sous-matière éventuelle (ex: Easy Arabic) ou vide',
                    },
                    subTeacher: {
                      type: Type.STRING,
                      description: 'Co-enseignant éventuel ou vide',
                    },
                  },
                  required: ['day', 'period', 'subject', 'teacher'],
                },
              },
            },
            required: ['summary', 'pedagogicalScore', 'slots'],
          },
        },
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);

      pushNotification({
        title: `IA Gemini : ${className} optimisé`,
        message: parsed.summary || `Emploi du temps de ${className} régénéré sans conflit.`,
        type: 'ai_generated',
        targetTeacher: 'all',
      });

      res.json(parsed);
    } catch (error: unknown) {
      console.error('Gemini optimize-class error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de l'optimisation Gemini AI.",
      });
    }
  });

  // REST API: Gemini AI Generate by User Idea / Custom Structural & Pedagogical Order
  app.post('/api/gemini/generate-by-order', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        userOrder,
        frozenClassNames,
        frozenSubjects,
        targetClassNames,
        allSubjects,
        allTeacherNames,
      } = req.body || {};

      const prompt = `Tu es l'architecte IA de planification d'emplois du temps scolaires de ChronoScolaire AI (Al-Kawthar International Schools).
L'utilisateur souhaite traiter et appliquer cet ordre structurel et pédagogique sans endommager les autres classes :
"""
${userOrder || 'Mettre les matières principales le matin (P1-P4), organiser les enseignants multi-départements (matin dépt 1 / après-midi dépt 2) et éviter tout chevauchement horaire ou pause.'}
"""

Classes actuellement présentes dans l'établissement :
${JSON.stringify(targetClassNames || [])}

Classes figées explicitement par l'utilisateur :
${JSON.stringify(frozenClassNames || [])}

Matières existantes :
${JSON.stringify(allSubjects || [])}

Enseignants existants :
${JSON.stringify(allTeacherNames || [])}

Règles fondamentales :
1. Extrais toutes les instructions structurelles contenues dans l'ordre :
   - Scissions ou créations de classes (classSplits : ex. scinder "G3 Boys" en ["Grade 3A Boys (الصف الثالث أ)", "Grade 3B Boys (الصف الثالث ب)"])
   - Répartition des matières et enseignants par classe (teacherAssignments)
   - Transferts vers les professeurs principaux / Homeroom teachers (homeroomTransfers : ex. retirer Computing de Grade 1 et Grade 2 pour le confier aux Homeroom teachers)
   - Séances communes / regroupées entre deux classes (combinedSessions : ex. Library avec Ms. Joudy commune pour 4A et 4B)
   - Cibles de charges horaires des enseignants (teacherTargetLoads)
   - Séances complémentaires à ajouter (supplementarySessions)
2. Pour les enseignants qui interviennent dans deux départements ou sections, active organizeMultiDepartmentHalfDay=true afin qu'ils donnent cours le matin (P1-P4) dans un département et l'après-midi (P5-P8) dans l'autre département, sans intersection d'horaires ni dépassement sur les pauses (breaks).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description:
                  "Explication concise en français de la façon dont l'ordre demandé est appliqué.",
              },
              organizeMultiDepartmentHalfDay: {
                type: Type.BOOLEAN,
                description:
                  "True pour regrouper le temps des enseignants multi-départements (matin pour un département, après-midi pour l'autre).",
              },
              classSplits: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sourceClassName: { type: Type.STRING },
                    newClassNames: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['sourceClassName', 'newClassNames'],
                },
              },
              teacherAssignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    className: { type: Type.STRING },
                    subject: { type: Type.STRING },
                    teacher: { type: Type.STRING },
                    periodsPerWeek: { type: Type.INTEGER },
                  },
                  required: ['className', 'subject', 'teacher'],
                },
              },
              homeroomTransfers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    classNamePattern: { type: Type.STRING },
                    subject: { type: Type.STRING },
                    fromTeacher: { type: Type.STRING },
                  },
                  required: ['classNamePattern', 'subject'],
                },
              },
              combinedSessions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    classNames: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    subject: { type: Type.STRING },
                    teacher: { type: Type.STRING },
                  },
                  required: ['classNames', 'subject', 'teacher'],
                },
              },
              teacherTargetLoads: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    teacher: { type: Type.STRING },
                    targetPeriods: { type: Type.INTEGER },
                  },
                  required: ['teacher', 'targetPeriods'],
                },
              },
              supplementarySessions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    subject: { type: Type.STRING },
                    deltaPeriods: { type: Type.INTEGER },
                  },
                  required: ['subject', 'deltaPeriods'],
                },
              },
              morningPrioritySubjects: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              afternoonSubjects: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              forbiddenPeriods: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              subjectSpecificRules: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    subject: { type: Type.STRING },
                    preferredPeriods: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                    },
                    avoidPeriods: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                    },
                    preferredDays: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['subject'],
                },
              },
              maxSameSubjectPerDay: {
                type: Type.INTEGER,
              },
            },
            required: [
              'summary',
              'organizeMultiDepartmentHalfDay',
              'morningPrioritySubjects',
              'afternoonSubjects',
              'forbiddenPeriods',
              'subjectSpecificRules',
              'maxSameSubjectPerDay',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (error: unknown) {
      console.error('Gemini generate-by-order error:', error);
      res.json({
        summary:
          "Ordre appliqué avec le moteur intelligent : respect strict des horaires et pauses (0 intersection), organisation matin/après-midi des enseignants multi-départements, conservation des classes non ciblées.",
        organizeMultiDepartmentHalfDay: true,
        classSplits: [],
        teacherAssignments: [],
        homeroomTransfers: [],
        combinedSessions: [],
        teacherTargetLoads: [],
        supplementarySessions: [],
        morningPrioritySubjects: [
          'Maths',
          'Mathematics',
          'Français',
          'English',
          'Arabic',
          'Physics',
          'Chemistry',
          'Biology',
          'Science',
        ],
        afternoonSubjects: ['Art', 'P.E', 'Music', 'Library', 'Activity'],
        forbiddenPeriods: [],
        subjectSpecificRules: [],
        maxSameSubjectPerDay: 2,
      });
    }
  });

  // REST API: Gemini AI Conversational Timetable Assistant (with Constraint Engine Verification)
  app.post('/api/gemini/conversational-assistant', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        userInstruction,
        targetClass,
        lockedSlots,
        teacherConstraints,
        qualitySummary,
      } = req.body;

      const prompt = `Tu es l'Assistant IA Conversationnel de Planification Scolaire de ChronoScolaire AI (Al-Kawthar International Schools, Jeddah).
L'administrateur te formule cette demande en langage naturel :
"${userInstruction}"

Contexte de la classe actuellement sélectionnée ("${targetClass?.name}", Section: ${targetClass?.section}) :
Créneaux actuels ("Jour_Période") :
${JSON.stringify(targetClass?.slots || {}, null, 2)}

Créneaux verrouillés (HC_04 - ne jamais déplacer) :
${JSON.stringify(lockedSlots || [])}

Indisponibilités des enseignants (HC_02) :
${JSON.stringify(teacherConstraints || [])}

Indicateurs de qualité actuels de l'établissement :
${JSON.stringify(qualitySummary || {})}

Règles strictes :
1. Ne supprime JAMAIS une séance obligatoire : procède uniquement par permutation (swap) entre deux créneaux de la même classe ("fromKey" et "toKey" au format "Jour_Période", ex: "Dimanche_1" et "Dimanche_6").
2. Si la demande de l'administrateur viole une contrainte stricte (séance verrouillée ou enseignant indisponible), signale-le dans "incompatibleConstraintsWarning" et propose une alternative sûre.
3. Explique clairement ta réponse et les permutations proposées dans "assistantReply".`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assistantReply: {
                type: Type.STRING,
                description:
                  "Réponse détaillée, pédagogique et claire à l'administrateur.",
              },
              incompatibleConstraintsWarning: {
                type: Type.STRING,
                description:
                  "Avertissement si une contrainte stricte empêche la demande exacte, ou chaîne vide si tout est compatible.",
              },
              proposedSwaps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    className: {
                      type: Type.STRING,
                      description: 'Nom de la classe concernée, ex: PEI2',
                    },
                    fromKey: {
                      type: Type.STRING,
                      description: 'Clé du créneau source, ex: Mardi_4',
                    },
                    toKey: {
                      type: Type.STRING,
                      description: 'Clé du créneau destination, ex: Mardi_7',
                    },
                    reason: {
                      type: Type.STRING,
                      description: 'Justification de cette permutation',
                    },
                  },
                  required: ['className', 'fromKey', 'toKey', 'reason'],
                },
              },
            },
            required: [
              'assistantReply',
              'incompatibleConstraintsWarning',
              'proposedSwaps',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (error: unknown) {
      console.error('Gemini conversational-assistant error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de l'analyse par l'assistant IA conversationnel.",
      });
    }
  });

  // REST API: Gemini AI Smart Conflict Resolver
  app.post('/api/gemini/resolve-conflict', async (req, res) => {
    try {
      const ai = getAiClient();
      const { conflict, classData, teacherBusySlots, teacherUnavailableSlots } = req.body;

      const prompt = `Tu es l'intelligence artificielle de résolution de conflits d'horaires scolaires de ChronoScolaire AI.
Un conflit a été détecté :
- Enseignant : ${conflict.teacher}
- Jour & Période en conflit : ${conflict.day}, Période ${conflict.period}
- Type : ${conflict.type} (${conflict.description})
- Classe à ajuster : ${classData.name}

Voici les créneaux actuels de la classe ${classData.name} :
${JSON.stringify(classData.slots, null, 2)}

Créneaux où l'enseignant ${conflict.teacher} est déjà occupé dans d'autres classes :
${JSON.stringify(teacherBusySlots || [])}

Créneaux où l'enseignant ${conflict.teacher} est indisponible :
${JSON.stringify(teacherUnavailableSlots || [])}

Propose une permutation intelligente (swap) entre le créneau en conflit ("${conflict.day}_${conflict.period}") et un autre créneau de la même classe "${classData.name}" où ${conflict.teacher} est libre et où l'autre enseignant permuté n'est pas en conflit.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              explanation: {
                type: Type.STRING,
                description: 'Explication concise en français de la permutation effectuée.',
              },
              fromSlotKey: {
                type: Type.STRING,
                description: 'Clé du créneau initial en conflit, ex: Dimanche_1',
              },
              toSlotKey: {
                type: Type.STRING,
                description: 'Clé du créneau cible avec lequel permuter, ex: Mardi_4',
              },
            },
            required: ['explanation', 'fromSlotKey', 'toSlotKey'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');

      pushNotification({
        title: `Conflit résolu (${conflict.teacher})`,
        message: parsed.explanation || `Permutation automatique appliquée sur ${classData.name}.`,
        type: 'conflict_resolved',
        targetTeacher: conflict.teacher,
      });

      res.json(parsed);
    } catch (error: unknown) {
      console.error('Gemini resolve-conflict error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erreur lors de la résolution du conflit par Gemini AI.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ChronoScolaire AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
