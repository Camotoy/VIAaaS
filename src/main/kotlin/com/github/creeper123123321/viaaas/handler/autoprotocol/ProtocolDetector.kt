package com.github.creeper123123321.viaaas.handler.autoprotocol

import com.github.creeper123123321.viaaas.channelSocketFactory
import com.github.creeper123123321.viaaas.childLoop
import com.github.creeper123123321.viaaas.codec.FrameCodec
import com.github.creeper123123321.viaaas.codec.MinecraftCodec
import com.github.creeper123123321.viaaas.handler.ConnectionData
import com.github.creeper123123321.viaaas.handler.MinecraftHandler
import com.github.creeper123123321.viaaas.packet.handshake.Handshake
import com.github.creeper123123321.viaaas.mcLogger
import com.github.creeper123123321.viaaas.packet.status.StatusRequest
import com.github.creeper123123321.viaaas.send
import java.util.concurrent.CompletableFuture
import java.net.InetSocketAddress
import us.myles.ViaVersion.api.protocol.ProtocolVersion
import io.netty.handler.timeout.ReadTimeoutHandler
import io.netty.channel.socket.nio.NioSocketChannel
import com.google.common.cache.CacheLoader
import java.util.concurrent.TimeUnit
import com.google.common.cache.CacheBuilder
import io.netty.bootstrap.Bootstrap
import io.netty.channel.*
import io.netty.util.concurrent.Future
import us.myles.ViaVersion.packets.State
import java.util.concurrent.ExecutionException

object ProtocolDetector {
    private val SERVER_VER = CacheBuilder.newBuilder()
        .expireAfterAccess(100, TimeUnit.SECONDS)
        .build(CacheLoader.from { address: InetSocketAddress? ->
            val future = CompletableFuture<ProtocolVersion>()
            try {
                val ch: ChannelFuture = Bootstrap()
                    .group(childLoop)
                    .channelFactory(channelSocketFactory())
                    .option(ChannelOption.TCP_NODELAY, true)
                    .option(ChannelOption.IP_TOS, 0x18)
                    .handler(object : ChannelInitializer<Channel>() {
                        override fun initChannel(channel: Channel) {
                            val data = ConnectionData(channel, state = ProtocolDetectionState(future), frontVer = -1)
                            channel.pipeline()
                                .addLast("timeout", ReadTimeoutHandler(30, TimeUnit.SECONDS))
                                .addLast("frame", FrameCodec())
                                .addLast("mc", MinecraftCodec())
                                .addLast("handler", MinecraftHandler(data, frontEnd = false))
                        }
                    })
                    .connect(address!!)
                ch.addListener { future1: Future<in Void> ->
                    if (!future1.isSuccess) {
                        future.completeExceptionally(future1.cause())
                    } else {
                        ch.channel().eventLoop().execute {
                            val handshake = Handshake()
                            handshake.address = address.hostString
                            handshake.port = address.port
                            handshake.protocolId = -1
                            handshake.nextState = State.STATUS
                            send(ch.channel(), handshake)
                            send(ch.channel(), StatusRequest(), flush = true)
                        }
                    }
                }
            } catch (throwable: Throwable) {
                future.completeExceptionally(throwable)
            }
            future
        })

    fun detectVersion(address: InetSocketAddress): CompletableFuture<ProtocolVersion> {
        return try {
            SERVER_VER[address]
        } catch (e: ExecutionException) {
            mcLogger.warn("Protocol auto detector error: ", e)
            CompletableFuture.completedFuture(null)
        }
    }
}
