package com.github.creeper123123321.viaaas.handler.autoprotocol

import com.github.creeper123123321.viaaas.handler.ConnectionData
import com.github.creeper123123321.viaaas.mcLogger
import io.netty.channel.ChannelHandlerContext
import io.netty.channel.ChannelPromise
import java.net.InetSocketAddress
import java.util.concurrent.TimeUnit
import io.netty.channel.ChannelDuplexHandler
import java.lang.Exception
import java.util.function.Consumer

// https://github.com/ViaVersion/ViaFabric/blob/mc-1.16/src/main/java/com/github/creeper123123321/viafabric/handler/clientside/ProtocolDetectionHandler.java
class ProtocolDetectorHandler(val connectionData: ConnectionData) : ChannelDuplexHandler() {
    private val queuedMessages = ArrayDeque<Pair<Any, ChannelPromise>>()
    private var hold = true
    private var pendentFlush = false

    @Throws(Exception::class)
    override fun channelActive(ctx: ChannelHandlerContext) {
        super.channelActive(ctx)
        if (ctx.channel().remoteAddress() is InetSocketAddress) {
            val timeoutRun = ctx.executor().schedule({
                mcLogger.warn(
                    "Timeout for protocol auto-detection in "
                            + ctx.channel().remoteAddress() + " server"
                )
                hold = false
                drainQueue(ctx)
                ctx.pipeline().remove(this)
            }, 10, TimeUnit.SECONDS)
            ProtocolDetector.detectVersion(ctx.channel().remoteAddress() as InetSocketAddress)
                .whenComplete { protocol, _ ->
                    if (protocol != null && protocol.version != -1) {
                        connectionData.viaBackServerVer = protocol.version
                    } else {
                        connectionData.viaBackServerVer = 47 // fallback
                    }

                    ctx.pipeline().remove(this)
                    timeoutRun.cancel(false)
                }
            // Let's cache it before we need it
        }
    }

    @Throws(Exception::class)
    override fun write(ctx: ChannelHandlerContext, msg: Any, promise: ChannelPromise) {
        if (!hold) {
            drainQueue(ctx)
            super.write(ctx, msg, promise)
        } else {
            queuedMessages.add(Pair(msg, promise))
        }
    }

    @Throws(Exception::class)
    override fun flush(ctx: ChannelHandlerContext) {
        if (!hold) {
            drainQueue(ctx)
            super.flush(ctx)
        } else {
            pendentFlush = true
        }
    }

    @Throws(Exception::class)
    override fun channelInactive(ctx: ChannelHandlerContext) {
        drainQueue(ctx)
        super.channelInactive(ctx)
    }

    private fun drainQueue(ctx: ChannelHandlerContext) {
        queuedMessages.forEach(Consumer {
            ctx.write(
                it.first,
                it.second
            )
        })
        queuedMessages.clear()
        if (pendentFlush) ctx.flush()
        pendentFlush = false
    }

    @Throws(Exception::class)
    override fun handlerRemoved(ctx: ChannelHandlerContext) {
        drainQueue(ctx)
        super.handlerRemoved(ctx)
    }
}