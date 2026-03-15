import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, CheckCircle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  client_id: string;
  last_message_at: string;
  is_resolved: boolean;
  created_at: string;
  client_name?: string;
  client_email?: string;
  last_message?: string;
  unread_count?: number;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function AdminChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations with client info
  const loadConversations = async () => {
    const { data: convos } = await supabase
      .from("chat_conversations")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (!convos) return;

    // Get client profiles
    const clientIds = convos.map(c => c.client_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", clientIds);

    // Get last messages and unread counts
    const enriched = await Promise.all(
      convos.map(async (conv) => {
        const profile = profiles?.find(p => p.user_id === conv.client_id);

        const { data: lastMsg } = await supabase
          .from("chat_messages")
          .select("message")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { count } = await supabase
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("is_read", false)
          .neq("sender_id", user?.id ?? "");

        return {
          ...conv,
          client_name: profile?.full_name || "Unknown",
          client_email: profile?.email || "",
          last_message: lastMsg?.message || "",
          unread_count: count || 0,
        };
      })
    );

    setConversations(enriched);
  };

  useEffect(() => { loadConversations(); }, []);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedId) return;
    const load = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);

      // Mark as read
      await supabase
        .from("chat_messages")
        .update({ is_read: true })
        .eq("conversation_id", selectedId)
        .neq("sender_id", user?.id ?? "")
        .eq("is_read", false);

      loadConversations();
    };
    load();
  }, [selectedId]);

  // Realtime for all messages
  useEffect(() => {
    const channel = supabase
      .channel("admin-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          if (newMsg.conversation_id === selectedId) {
            setMessages(prev => {
              if (prev.find(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            // Mark as read immediately
            if (newMsg.sender_id !== user?.id) {
              supabase.from("chat_messages").update({ is_read: true }).eq("id", newMsg.id).then();
            }
          }
          loadConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_conversations" },
        () => { loadConversations(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId, user]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!reply.trim() || !selectedId || !user || sending) return;
    setSending(true);
    await supabase.from("chat_messages").insert({
      conversation_id: selectedId,
      sender_id: user.id,
      message: reply.trim(),
    });
    await supabase
      .from("chat_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", selectedId);
    setReply("");
    setSending(false);
  };

  const handleResolve = async (convId: string, resolved: boolean) => {
    await supabase
      .from("chat_conversations")
      .update({ is_resolved: !resolved })
      .eq("id", convId);
    loadConversations();
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const selected = conversations.find(c => c.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversations list */}
      <Card className="w-[340px] flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Chat Inbox
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <ScrollArea className="flex-1">
          {conversations.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No conversations yet
            </div>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={cn(
                "w-full text-left p-4 border-b hover:bg-accent/50 transition-colors",
                selectedId === conv.id && "bg-accent"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate">{conv.client_name}</span>
                <div className="flex items-center gap-1.5">
                  {conv.is_resolved && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  )}
                  {(conv.unread_count ?? 0) > 0 && (
                    <Badge className="h-5 min-w-[20px] flex items-center justify-center p-0 text-[10px]">
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.client_email}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground truncate flex-1">{conv.last_message}</p>
                <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                  {formatTime(conv.last_message_at)}
                </span>
              </div>
            </button>
          ))}
        </ScrollArea>
      </Card>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a conversation to start replying</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{selected?.client_name}</p>
                <p className="text-xs text-muted-foreground">{selected?.client_email}</p>
              </div>
              <Button
                variant={selected?.is_resolved ? "outline" : "default"}
                size="sm"
                onClick={() => selected && handleResolve(selected.id, selected.is_resolved)}
              >
                {selected?.is_resolved ? (
                  <><Circle className="h-3.5 w-3.5 mr-1" /> Reopen</>
                ) : (
                  <><CheckCircle className="h-3.5 w-3.5 mr-1" /> Resolve</>
                )}
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isAdmin = msg.sender_id !== selected?.client_id;
                return (
                  <div key={msg.id} className={cn("flex", isAdmin ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                        isAdmin
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      )}
                    >
                      <p className="break-words">{msg.message}</p>
                      <p className={cn("text-[10px] mt-1", isAdmin ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply input */}
            <div className="border-t p-3 flex gap-2">
              <Input
                placeholder="Type a reply..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                className="flex-1 h-9 text-sm"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!reply.trim() || sending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
